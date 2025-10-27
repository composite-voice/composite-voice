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
} from './core/types/providers';
import { AgentStateMachine } from './core/state/AgentStateMachine';
import { SimpleAudioCaptureStateMachine as AudioCaptureStateMachine } from './core/state/SimpleAudioCaptureStateMachine';
import { SimpleAudioPlaybackStateMachine as AudioPlaybackStateMachine } from './core/state/SimpleAudioPlaybackStateMachine';
import { SimpleProcessingStateMachine as ProcessingStateMachine } from './core/state/SimpleProcessingStateMachine';
import { AudioCapture } from './core/audio/AudioCapture';
import { AudioPlayer } from './core/audio/AudioPlayer';
import { Logger, createLogger } from './utils/logger';
import { ConfigurationError, InvalidStateError } from './utils/errors';
import { DEFAULT_LOGGING_CONFIG } from './core/types/config';

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
  private audioCapture?: AudioCapture;
  private audioPlayer?: AudioPlayer;

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
      this.agentStateMachine.setError();
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
      const event = {
        type: result.isFinal
          ? ('transcription.final' as const)
          : ('transcription.interim' as const),
        text: result.text,
        confidence: result.confidence,
        timestamp: Date.now(),
        metadata: result.metadata,
      };
      this.emitEvent(event as CompositeVoiceEvent);

      // If final transcription, send to LLM
      if (result.isFinal && result.text.trim()) {
        void this.processLLM(result.text);
      }
    });

    // Setup TTS provider callbacks (only Live TTS has onAudio)
    if (isLiveTTS(tts)) {
      // Initialize AudioPlayer for Live TTS (unless native TTS which plays directly)
      if (tts.constructor.name !== 'NativeTTS') {
        this.audioPlayer = new AudioPlayer(this.config.audio?.output, this.logger);
      }

      tts.onAudio((chunk) => {
        this.emitEvent({
          type: 'tts.audio',
          chunk,
          timestamp: Date.now(),
        });

        // Play audio via AudioPlayer (unless native TTS)
        if (this.audioPlayer) {
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
   * Process text through LLM
   */
  private async processLLM(text: string): Promise<void> {
    // Only process if we're in a valid state (listening or error)
    // Ignore transcriptions that come in after stopping
    if (!this.agentStateMachine.isIn('listening', 'error')) {
      this.logger.debug('Ignoring transcription - not in listening state');
      return;
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
      const responseIterable = await llm.generate(text);
      let fullResponse = '';

      // Stream LLM response
      this.processingStateMachine.setStreaming();

      for await (const chunk of responseIterable) {
        fullResponse += chunk;
        this.emitEvent({
          type: 'llm.chunk',
          chunk,
          accumulated: fullResponse,
          timestamp: Date.now(),
        });

        // If TTS is Live (WebSocket), send chunks
        if (isLiveTTS(tts)) {
          tts.sendText(chunk);
        }
      }

      this.processingStateMachine.setComplete();

      this.emitEvent({
        type: 'llm.complete',
        text: fullResponse,
        timestamp: Date.now(),
      });

      // REST TTS - send full response
      if (isRestTTS(tts)) {
        await this.processTTS(fullResponse);
      } else if (isLiveTTS(tts)) {
        // Finalize streaming TTS
        await tts.finalize();
      }

      // Processing complete, reset to idle
      this.processingStateMachine.setIdle();
    } catch (error) {
      this.logger.error('LLM processing error', error);
      this.emitEvent({
        type: 'llm.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });
      this.processingStateMachine.setError();
      this.agentStateMachine.setError();
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

      // Pause capture while speaking to prevent echo
      const captureState = this.captureStateMachine.getState();
      if (captureState === 'active') {
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
        // Native TTS plays directly via browser
        if (tts.constructor.name === 'NativeTTS') {
          await tts.synthesize(text);
        } else {
          // Non-native REST TTS: get audio blob and play via AudioPlayer
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

      this.agentStateMachine.setError();
    }
  }

  // Playback handling removed - providers manage their own I/O

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

      // Native STT manages its own audio capture
      if (stt.constructor.name === 'NativeSTT') {
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
      } else {
        // Non-native STT: CompositeVoice captures audio and sends to provider
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
      this.agentStateMachine.setError();
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
   * Stop speaking (cancel TTS)
   * Note: This is provider-specific - not all providers support cancellation
   */
  async stopSpeaking(): Promise<void> {
    this.assertInitialized();
    // Providers handle their own playback - SDK can't stop it directly
    this.logger.warn('stopSpeaking() - providers manage their own audio, cannot cancel from SDK');
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
   * Get current agent state
   */
  getState(): AgentState {
    return this.agentStateMachine.getState();
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
