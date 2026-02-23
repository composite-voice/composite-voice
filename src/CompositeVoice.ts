/**
 * Main CompositeVoice SDK class
 */

import { EventEmitter } from './core/events/EventEmitter';
import type {
  CompositeVoiceEvent,
  EventType,
  EventListenerMap,
  AgentState,
} from './core/events/types';
import type { CompositeVoiceConfig } from './core/types/config';
import type {
  STTProvider,
  TTSProvider,
  LiveSTTProvider,
  LiveTTSProvider,
  RestTTSProvider,
  LLMMessage,
} from './core/types/providers';
import { AgentStateMachine } from './core/state/AgentStateMachine';
import { SimpleAudioCaptureStateMachine as AudioCaptureStateMachine } from './core/state/SimpleAudioCaptureStateMachine';
import { SimpleAudioPlaybackStateMachine as AudioPlaybackStateMachine } from './core/state/SimpleAudioPlaybackStateMachine';
import { SimpleProcessingStateMachine as ProcessingStateMachine } from './core/state/SimpleProcessingStateMachine';
import { AudioCapture } from './core/audio/AudioCapture';
import { AudioPlayer } from './core/audio/AudioPlayer';
import { Logger, createLogger } from './utils/logger';
import { ConfigurationError, InvalidStateError } from './utils/errors';
import { DEFAULT_LOGGING_CONFIG, DEFAULT_TURN_TAKING_CONFIG } from './core/types/config';
import { shouldPauseCaptureOnPlayback } from './utils/turnTaking';

/**
 * Type guard to check if STT provider is Live (WebSocket)
 */
function isLiveSTT(provider: STTProvider): provider is LiveSTTProvider {
  return provider.type === 'websocket';
}

/**
 * Type guard to check if TTS provider is Live (WebSocket)
 */
function isLiveTTS(provider: TTSProvider): provider is LiveTTSProvider {
  return provider.type === 'websocket';
}

/**
 * Type guard to check if TTS provider is REST
 */
function isRestTTS(provider: TTSProvider): provider is RestTTSProvider {
  return provider.type === 'rest';
}

/**
 * Main CompositeVoice SDK class
 */
export class CompositeVoice {
  private config: CompositeVoiceConfig;
  private events: EventEmitter;
  private logger: Logger;

  // State machines
  private captureStateMachine: AudioCaptureStateMachine;
  private playbackStateMachine: AudioPlaybackStateMachine;
  private processingStateMachine: ProcessingStateMachine;
  private agentStateMachine: AgentStateMachine;

  // Audio I/O (only for non-native providers)
  private audioCapture: AudioCapture | undefined = undefined;
  private audioPlayer: AudioPlayer | undefined = undefined;

  // Conversation history (when enabled via config)
  private conversationHistory: LLMMessage[] = [];

  // Eager LLM pipeline state (preflight / speculative generation)
  private eagerAbortController: AbortController | null = null;
  private eagerText: string | null = null;

  private initialized = false;

  constructor(config: CompositeVoiceConfig) {
    this.validateConfig(config);
    this.config = config;

    // Setup logging
    const loggingConfig = { ...DEFAULT_LOGGING_CONFIG, ...config.logging };
    this.logger = createLogger('CompositeVoice', loggingConfig);

    // Initialize event emitter
    this.events = new EventEmitter();

    // Initialize the 3 state machines
    this.captureStateMachine = new AudioCaptureStateMachine(this.logger);
    this.playbackStateMachine = new AudioPlaybackStateMachine(this.logger);
    this.processingStateMachine = new ProcessingStateMachine(this.logger);

    // Initialize orchestrator
    this.agentStateMachine = new AgentStateMachine(this.logger);

    // Setup state change event emission
    this.agentStateMachine.onStateChange((newState, oldState) => {
      this.emitEvent({
        type: 'agent.stateChange',
        state: newState,
        previousState: oldState,
        timestamp: Date.now(),
      });
    });

    // Note: agentStateMachine.initialize() is called in initialize()
    // so that state transitions happen after event listeners are attached
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: CompositeVoiceConfig): void {
    if (!config.stt || !config.llm || !config.tts) {
      throw new ConfigurationError('CompositeVoice requires stt, llm, and tts providers');
    }
  }

  /**
   * Initialize the SDK and all providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }

    this.logger.info('Initializing CompositeVoice SDK');

    try {
      // Connect agent state machine to sub-machines
      // This will trigger idle→ready transition
      this.agentStateMachine.initialize(
        this.captureStateMachine,
        this.playbackStateMachine,
        this.processingStateMachine
      );

      // Initialize providers
      await Promise.all([
        this.config.stt.initialize(),
        this.config.llm.initialize(),
        this.config.tts.initialize(),
      ]);
      this.setupProviders();

      this.initialized = true;

      this.emitEvent({
        type: 'agent.ready',
        timestamp: Date.now(),
      });

      this.logger.info('CompositeVoice SDK initialized');
    } catch (error) {
      this.logger.error('Failed to initialize', error);
      this.emitAgentError(error as Error, 'initialize', false);
      throw error;
    }
  }

  /**
   * Setup provider event handlers
   */
  private setupProviders(): void {
    const { stt, tts } = this.config;

    // Setup STT provider callbacks (all STT providers have onTranscription)
    stt.onTranscription((result) => {
      if (result.isPreflight) {
        // ── Preflight / eager end-of-turn ──────────────────────────────────
        // Deepgram v2 models signal early completion before speech_final.
        this.emitEvent({
          type: 'transcription.preflight',
          text: result.text,
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: result.metadata,
        } as CompositeVoiceEvent);

        if (this.config.eagerLLM?.enabled && result.text.trim()) {
          this.startEagerLLM(result.text);
        }
        return;
      }

      // Determine whether this result marks a complete utterance.
      // speechFinal is set by providers that distinguish segment-final
      // (isFinal) from utterance-final (speechFinal).
      // For providers that don't set speechFinal, fall back to isFinal.
      const isUtteranceFinal = result.speechFinal ?? result.isFinal;

      if (isUtteranceFinal && result.text.trim()) {
        // ── Utterance complete ─────────────────────────────────────────────
        this.emitEvent({
          type: 'transcription.speechFinal',
          text: result.text,
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: result.metadata,
        } as CompositeVoiceEvent);

        // Also emit transcription.final for subscribers that only need text
        this.emitEvent({
          type: 'transcription.final',
          text: result.text,
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: result.metadata,
        } as CompositeVoiceEvent);

        this.handleSpeechFinal(result.text);
      } else if (result.isFinal) {
        // ── Mid-utterance segment finalised (Deepgram is_final, not speech_final) ──
        // Emit for display/caption purposes but do NOT trigger LLM.
        this.emitEvent({
          type: 'transcription.final',
          text: result.text,
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: result.metadata,
        } as CompositeVoiceEvent);
      } else {
        // ── Interim ───────────────────────────────────────────────────────
        this.emitEvent({
          type: 'transcription.interim',
          text: result.text,
          confidence: result.confidence,
          timestamp: Date.now(),
          metadata: result.metadata,
        } as CompositeVoiceEvent);
      }
    });

    // Setup TTS provider callbacks (only Live TTS has onAudio)
    if (isLiveTTS(tts)) {
      // Initialize AudioPlayer for Live TTS (unless provider manages its own audio)
      if (!tts.managedAudio) {
        this.audioPlayer = new AudioPlayer(this.config.audio?.output, this.logger);
      }

      tts.onAudio((chunk) => {
        this.emitEvent({
          type: 'tts.audio',
          chunk,
          timestamp: Date.now(),
        });

        if (this.audioPlayer) {
          // Transition from idle → buffering when first audio chunk arrives,
          // signalling the AgentStateMachine that the agent is now speaking.
          if (this.playbackStateMachine.getState() === 'idle') {
            this.playbackStateMachine.setBuffering();
          }
          void this.audioPlayer.addChunk(chunk);
        }
      });

      // Register metadata callback (provider may or may not emit metadata)
      tts.onMetadata((metadata) => {
        this.emitEvent({
          type: 'tts.metadata',
          metadata,
          timestamp: Date.now(),
        });

        // Configure AudioPlayer with metadata
        if (this.audioPlayer) {
          this.audioPlayer.setMetadata(metadata);
        }
      });
    }
  }

  /**
   * Start a speculative ("eager") LLM generation on a preflight transcript.
   * Stores an AbortController so it can be cancelled if speech_final arrives
   * with different text.
   */
  private startEagerLLM(text: string): void {
    // Cancel any previous speculative generation
    if (this.eagerAbortController) {
      this.logger.debug('Cancelling previous eager LLM generation');
      this.eagerAbortController.abort();
      this.eagerAbortController = null;
      this.eagerText = null;
    }

    this.logger.debug('Starting eager LLM on preflight', { text });
    const controller = new AbortController();
    this.eagerAbortController = controller;
    this.eagerText = text;

    void this.processLLM(text, controller.signal).catch((err) => {
      // AbortError is expected; surface other errors normally
      if ((err as Error).name !== 'AbortError') {
        this.logger.error('Eager LLM processing error', err);
      }
    });
  }

  /**
   * Handle a confirmed speech_final utterance.
   * Checks whether an eager generation is already running for this text.
   */
  private handleSpeechFinal(text: string): void {
    if (!text.trim()) return;

    if (this.eagerAbortController) {
      const eagerText = this.eagerText;
      const shouldCancel = this.config.eagerLLM?.cancelOnTextChange ?? true;

      if (eagerText === text) {
        // Exact match — eager generation is already running; let it complete.
        this.logger.debug('speech_final matches preflight text — using eager generation');
        this.eagerAbortController = null;
        this.eagerText = null;
        return;
      }

      if (shouldCancel) {
        this.logger.debug(
          'speech_final text differs from preflight — cancelling eager, restarting',
          {
            preflight: eagerText,
            final: text,
          }
        );
        this.eagerAbortController.abort();
        this.eagerAbortController = null;
        this.eagerText = null;
        void this.processLLM(text);
      } else {
        // Accept the preflight response even though text changed
        this.logger.debug(
          'speech_final text differs but cancelOnTextChange=false — accepting eager response'
        );
        this.eagerAbortController = null;
        this.eagerText = null;
      }
    } else {
      // No eager generation — normal path
      void this.processLLM(text);
    }
  }

  /**
   * Process text through LLM
   * @param signal Optional AbortSignal for cancellation (eager pipeline)
   */
  private async processLLM(text: string, signal?: AbortSignal): Promise<void> {
    // Only process if we're in a valid state (listening or error)
    // Ignore transcriptions that come in after stopping
    if (!this.agentStateMachine.isIn('listening', 'error')) {
      this.logger.debug('Ignoring transcription - not in listening state');
      return;
    }

    if (signal?.aborted) return;

    // If processing state machine is in error, reset to idle first so we can retry.
    // The error → processing transition is not valid; we must go error → idle → processing.
    if (this.processingStateMachine.getState() === 'error') {
      this.processingStateMachine.setIdle();
    }

    // Update processing state machine → AgentStateMachine will derive 'thinking'
    this.processingStateMachine.setProcessing();

    this.emitEvent({
      type: 'llm.start',
      prompt: text,
      timestamp: Date.now(),
    });

    try {
      const { llm, tts } = this.config;
      const historyConfig = this.config.conversationHistory;
      const useHistory = historyConfig?.enabled === true;

      // Build message list and get response iterable
      let responseIterable: AsyncIterable<string>;
      if (useHistory) {
        this.conversationHistory.push({ role: 'user', content: text });
        // Trim to maxTurns (each turn = 1 user msg + 1 assistant msg = 2 entries)
        const maxTurns = historyConfig?.maxTurns ?? 0;
        if (maxTurns > 0 && this.conversationHistory.length > maxTurns * 2) {
          this.conversationHistory = this.conversationHistory.slice(-(maxTurns * 2));
        }
        responseIterable = await llm.generateFromMessages(
          this.conversationHistory,
          signal ? { signal } : undefined
        );
      } else {
        responseIterable = await llm.generate(text, signal ? { signal } : undefined);
      }

      // Check if aborted before we start streaming (generate() may have taken time)
      if (signal?.aborted) {
        this.processingStateMachine.setIdle();
        return;
      }

      let fullResponse = '';
      let abortedMidStream = false;

      // Stream LLM response
      this.processingStateMachine.setStreaming();

      for await (const chunk of responseIterable) {
        if (signal?.aborted) {
          abortedMidStream = true;
          break;
        }

        fullResponse += chunk;
        this.emitEvent({
          type: 'llm.chunk',
          chunk,
          accumulated: fullResponse,
          timestamp: Date.now(),
        });

        // If TTS is Live (WebSocket), send chunks in real-time
        if (isLiveTTS(tts)) {
          tts.sendText(chunk);
        }
      }

      if (abortedMidStream) {
        // Eager generation was cancelled mid-stream.
        // If Live TTS received partial text, we need to reset it.
        this.logger.debug('LLM generation aborted mid-stream — resetting state');
        if (isLiveTTS(tts) && this.playbackStateMachine.getState() !== 'idle') {
          try {
            await tts.disconnect();
            await tts.connect();
          } catch (err) {
            this.logger.warn('Failed to reset Live TTS after abort', err);
          }
          const ps = this.playbackStateMachine.getState();
          if (ps === 'buffering' || ps === 'playing') {
            this.playbackStateMachine.setStopped();
            this.playbackStateMachine.setIdle();
          }
        }
        if (this.audioPlayer) {
          await this.audioPlayer.stop();
        }
        this.processingStateMachine.setIdle();
        return;
      }

      this.processingStateMachine.setComplete();

      this.emitEvent({
        type: 'llm.complete',
        text: fullResponse,
        timestamp: Date.now(),
      });

      // Append assistant response to history
      if (useHistory && fullResponse) {
        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
      }

      // REST TTS - send full response
      if (isRestTTS(tts)) {
        await this.processTTS(fullResponse);
      } else if (isLiveTTS(tts)) {
        // Live TTS: finalize synthesis and wait for audio playback to complete
        await this.finalizeLiveTTS(fullResponse);
      }

      // Processing complete, reset to idle
      this.processingStateMachine.setIdle();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Expected during eager cancellation — reset quietly
        this.logger.debug('LLM generation aborted via signal');
        this.processingStateMachine.setIdle();
        return;
      }

      this.logger.error('LLM processing error', error);
      this.emitEvent({
        type: 'llm.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });
      this.processingStateMachine.setError();
      this.emitAgentError(error as Error, 'processLLM');
    }
  }

  /**
   * Process text through TTS
   */
  private async processTTS(text: string): Promise<void> {
    this.emitEvent({
      type: 'tts.start',
      text,
      timestamp: Date.now(),
    });

    try {
      const { stt, tts } = this.config;
      const turnTakingConfig = { ...DEFAULT_TURN_TAKING_CONFIG, ...this.config.turnTaking };
      const shouldPause = shouldPauseCaptureOnPlayback(turnTakingConfig, stt, tts, this.logger);

      // Optionally pause capture while speaking to prevent echo
      const captureState = this.captureStateMachine.getState();
      if (shouldPause && captureState === 'active') {
        this.captureStateMachine.setPaused();
        if (isLiveSTT(stt)) {
          await stt.disconnect();
        }
      } else if (captureState === 'error') {
        // Can't pause from error, skip disconnect
        this.logger.warn('Capture in error state, skipping pause');
      }

      // Start playback (will derive 'speaking' state)
      this.playbackStateMachine.setBuffering();

      // REST TTS: synthesize and play
      if (isRestTTS(tts)) {
        if (tts.managedAudio) {
          // Provider manages its own audio playback (e.g. NativeTTS via SpeechSynthesis)
          await tts.synthesize(text);
        } else {
          // SDK-managed TTS: get audio blob and play via AudioPlayer
          if (!this.audioPlayer) {
            this.audioPlayer = new AudioPlayer(this.config.audio?.output, this.logger);
          }
          const audioBlob = await tts.synthesize(text);
          await this.audioPlayer.play(audioBlob);
        }
      }

      // Playback complete: buffering -> stopped -> idle
      this.playbackStateMachine.setStopped();
      this.playbackStateMachine.setIdle();

      // Resume capture based on current state
      const resumeCaptureState = this.captureStateMachine.getState();
      if (resumeCaptureState === 'paused') {
        // paused → active (resume)
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      } else if (resumeCaptureState === 'error') {
        // error → idle → starting → active
        this.captureStateMachine.setIdle();
        this.captureStateMachine.setStarting();
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      }
      // else: already in a valid state, don't change

      this.emitEvent({
        type: 'tts.complete',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('TTS processing error', error);

      // Set playback to error state (will derive agent 'error' state)
      // From any playback state -> error is valid
      if (this.playbackStateMachine.getState() !== 'error') {
        this.playbackStateMachine.setError();
      }

      // Try to recover - resume STT
      try {
        const { stt } = this.config;

        // Recover capture state machine
        const captureState = this.captureStateMachine.getState();
        if (captureState === 'error') {
          // error → idle → starting → active
          this.captureStateMachine.setIdle();
          this.captureStateMachine.setStarting();
        } else if (captureState === 'paused') {
          // paused → active (already handled above, but for safety)
          // No state change needed, just reconnect
        }

        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      } catch (recoveryError) {
        this.logger.error('Failed to recover from TTS error', recoveryError);
        if (this.captureStateMachine.getState() !== 'error') {
          this.captureStateMachine.setError();
        }
      }

      this.emitEvent({
        type: 'tts.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });

      this.emitAgentError(error as Error, 'processTTS');
    }
  }

  /**
   * Handle Live TTS finalization: pause capture, wait for audio, update states, resume capture.
   * This is the Live TTS analogue of processTTS() for REST TTS.
   */
  private async finalizeLiveTTS(fullText: string): Promise<void> {
    this.emitEvent({
      type: 'tts.start',
      text: fullText,
      timestamp: Date.now(),
    });

    try {
      const { stt, tts } = this.config;
      const turnTakingConfig = { ...DEFAULT_TURN_TAKING_CONFIG, ...this.config.turnTaking };
      const shouldPause = shouldPauseCaptureOnPlayback(turnTakingConfig, stt, tts, this.logger);

      // Optionally pause capture while audio plays to prevent echo
      const captureState = this.captureStateMachine.getState();
      if (shouldPause && captureState === 'active') {
        this.captureStateMachine.setPaused();
        if (isLiveSTT(stt)) {
          await stt.disconnect();
        }
      } else if (captureState === 'error') {
        this.logger.warn('Capture in error state during Live TTS, skipping pause');
      }

      if (isLiveTTS(tts)) {
        // Finalize the TTS provider (flushes remaining text)
        await tts.finalize();

        // Wait for AudioPlayer to drain all queued audio
        if (this.audioPlayer) {
          await this.audioPlayer.waitForCompletion();
        }
      }

      // Playback complete: buffering/playing → stopped → idle
      const playbackState = this.playbackStateMachine.getState();
      if (playbackState === 'buffering' || playbackState === 'playing') {
        this.playbackStateMachine.setStopped();
        this.playbackStateMachine.setIdle();
      } else if (playbackState === 'idle') {
        // No audio was received from TTS (empty response) - nothing to do
      }

      // Resume capture
      const resumeCaptureState = this.captureStateMachine.getState();
      if (resumeCaptureState === 'paused') {
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      } else if (resumeCaptureState === 'error') {
        this.captureStateMachine.setIdle();
        this.captureStateMachine.setStarting();
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      }

      this.emitEvent({
        type: 'tts.complete',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Live TTS finalization error', error);

      const playbackState = this.playbackStateMachine.getState();
      if (playbackState !== 'error' && playbackState !== 'idle') {
        try {
          this.playbackStateMachine.setStopped();
          this.playbackStateMachine.setIdle();
        } catch {
          // Ignore state transition errors during recovery
        }
      }

      // Try to resume STT capture
      try {
        const { stt } = this.config;
        const captureState = this.captureStateMachine.getState();
        if (captureState === 'error') {
          this.captureStateMachine.setIdle();
          this.captureStateMachine.setStarting();
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
        this.captureStateMachine.setActive();
      } catch (recoveryError) {
        this.logger.error('Failed to recover capture after Live TTS error', recoveryError);
        if (this.captureStateMachine.getState() !== 'error') {
          this.captureStateMachine.setError();
        }
      }

      this.emitEvent({
        type: 'tts.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });

      this.emitAgentError(error as Error, 'finalizeLiveTTS');
      throw error;
    }
  }

  /**
   * Start listening for user input
   */
  async startListening(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('ready') && !this.agentStateMachine.is('idle')) {
      throw new InvalidStateError(this.agentStateMachine.getState(), 'start listening');
    }

    this.logger.info('Starting to listen');
    this.captureStateMachine.setStarting();

    try {
      const { stt } = this.config;

      // Provider manages its own audio capture (e.g. NativeSTT via SpeechRecognition)
      if (stt.managedAudio) {
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
      } else {
        // SDK-managed STT: CompositeVoice captures audio and sends to provider
        if (isLiveSTT(stt)) {
          // Initialize AudioCapture if needed
          if (!this.audioCapture) {
            this.audioCapture = new AudioCapture(this.config.audio?.input, this.logger);
          }

          // Connect STT provider first
          await stt.connect();

          // Start capturing audio and send to STT
          await this.audioCapture.start((audioData) => {
            stt.sendAudio(audioData);
          });
        }
      }

      this.captureStateMachine.setActive();

      this.emitEvent({
        type: 'audio.capture.start',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to start listening', error);
      this.captureStateMachine.setError();
      this.emitAgentError(error as Error, 'startListening');
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('listening')) {
      this.logger.warn('Not currently listening');
      return;
    }

    this.logger.info('Stopping listening');

    try {
      const { stt } = this.config;

      // Stop audio capture
      if (this.audioCapture) {
        await this.audioCapture.stop();
      }

      // Disconnect STT provider
      if (isLiveSTT(stt)) {
        await stt.disconnect();
      }

      this.captureStateMachine.setStopped();

      this.emitEvent({
        type: 'audio.capture.stop',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to stop listening', error);
      throw error;
    }
  }

  /**
   * Stop speaking (cancel TTS playback)
   */
  async stopSpeaking(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('speaking')) {
      this.logger.debug('stopSpeaking() called but not currently speaking');
      return;
    }

    try {
      const { tts } = this.config;

      if (this.audioPlayer) {
        await this.audioPlayer.stop();
      }

      if (isLiveTTS(tts)) {
        await tts.disconnect();
      }

      const playbackState = this.playbackStateMachine.getState();
      if (playbackState !== 'idle' && playbackState !== 'error') {
        try {
          this.playbackStateMachine.setStopped();
          this.playbackStateMachine.setIdle();
        } catch {
          // ignore invalid transitions
        }
      }

      this.emitEvent({ type: 'tts.complete', timestamp: Date.now() });
    } catch (error) {
      this.logger.error('Failed to stop speaking', error);
      throw error;
    }
  }

  /**
   * Register an event listener
   */
  on<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Register a one-time event listener
   */
  once<T extends EventType>(event: T, listener: EventListenerMap[T]): () => void {
    return this.events.once(event, listener);
  }

  /**
   * Remove an event listener
   */
  off<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): void {
    this.events.off(event, listener);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: CompositeVoiceEvent): void {
    this.events.emitSync(event);
  }

  /**
   * Emit an agent.error event and transition the agent state machine to error.
   * Centralises the two calls so they are never accidentally separated.
   */
  private emitAgentError(error: Error, context: string, recoverable = true): void {
    this.emitEvent({
      type: 'agent.error',
      error,
      recoverable,
      context,
      timestamp: Date.now(),
    });
    this.agentStateMachine.setError();
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return this.agentStateMachine.getState();
  }

  /**
   * Get a copy of the current conversation history.
   * Returns an empty array if history is not enabled.
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.logger.debug('Conversation history cleared');
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Assert that SDK is initialized
   */
  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('CompositeVoice is not initialized. Call initialize() first.');
    }
  }

  /**
   * Audio I/O is managed by providers, not the SDK
   * These methods have been removed - providers own their audio capture/playback
   */

  /**
   * Clean up and dispose of all resources
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('Already disposed');
      return;
    }

    this.logger.info('Disposing CompositeVoice SDK');

    try {
      // Stop any active operations
      if (this.agentStateMachine.is('listening')) {
        await this.stopListening();
      }
      if (this.agentStateMachine.is('speaking')) {
        await this.stopSpeaking();
      }

      // Cancel any in-flight eager generation
      if (this.eagerAbortController) {
        this.eagerAbortController.abort();
        this.eagerAbortController = null;
        this.eagerText = null;
      }

      // Clear conversation history
      this.conversationHistory = [];

      // Stop and dispose SDK-managed audio I/O
      if (this.audioCapture) {
        await this.audioCapture.stop();
        this.audioCapture = undefined;
      }
      if (this.audioPlayer) {
        await this.audioPlayer.dispose();
        this.audioPlayer = undefined;
      }

      // Dispose providers (they handle their own audio cleanup)
      await Promise.all([
        this.config.stt.dispose(),
        this.config.llm.dispose(),
        this.config.tts.dispose(),
      ]);

      // Clear event listeners
      this.events.removeAllListeners();

      // Reset and dispose state machines
      this.agentStateMachine.reset();
      this.captureStateMachine.dispose();
      this.playbackStateMachine.dispose();
      this.processingStateMachine.dispose();
      this.agentStateMachine.dispose();

      this.initialized = false;

      this.logger.info('CompositeVoice SDK disposed');
    } catch (error) {
      this.logger.error('Error disposing SDK', error);
      throw error;
    }
  }
}
