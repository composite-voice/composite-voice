/**
 * Main CompositeVoice SDK module providing the primary public API for the voice pipeline.
 *
 * @remarks
 * This module exports the {@link CompositeVoice} class, which orchestrates the full
 * Speech-to-Text (STT) to Large Language Model (LLM) to Text-to-Speech (TTS)
 * pipeline. It manages provider lifecycles, state machines, audio I/O, event
 * emission, conversation history, and the eager/speculative LLM pipeline.
 *
 * @packageDocumentation
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
  LLMProvider,
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
import { textSimilarity } from './utils/textSimilarity';

/**
 * Type guard that checks whether an STT provider uses a live WebSocket connection.
 *
 * @remarks
 * Live STT providers stream audio in real-time over a WebSocket and support
 * `connect()`, `sendAudio()`, and `disconnect()` methods. REST STT providers,
 * by contrast, transcribe complete audio blobs via `transcribe()`.
 *
 * @param provider - The STT provider instance to check.
 * @returns `true` if the provider's `type` is `'websocket'`, narrowing it to {@link LiveSTTProvider}.
 */
function isLiveSTT(provider: STTProvider): provider is LiveSTTProvider {
  return provider.type === 'websocket';
}

/**
 * Type guard that checks whether a TTS provider uses a live WebSocket connection.
 *
 * @remarks
 * Live TTS providers stream synthesized audio chunks in real-time over a
 * WebSocket and support `connect()`, `sendText()`, `finalize()`, and
 * `disconnect()` methods. They also expose `onAudio()` and `onMetadata()`
 * callbacks for receiving audio data.
 *
 * @param provider - The TTS provider instance to check.
 * @returns `true` if the provider's `type` is `'websocket'`, narrowing it to {@link LiveTTSProvider}.
 */
function isLiveTTS(provider: TTSProvider): provider is LiveTTSProvider {
  return provider.type === 'websocket';
}

/**
 * Type guard that checks whether a TTS provider uses a REST API.
 *
 * @remarks
 * REST TTS providers synthesize complete text into an audio blob via a single
 * HTTP request through the `synthesize()` method. Providers that manage their
 * own audio playback (e.g., NativeTTS via `SpeechSynthesis`) also use this type.
 *
 * @param provider - The TTS provider instance to check.
 * @returns `true` if the provider's `type` is `'rest'`, narrowing it to {@link RestTTSProvider}.
 */
function isRestTTS(provider: TTSProvider): provider is RestTTSProvider {
  return provider.type === 'rest';
}

/**
 * The primary class of the CompositeVoice SDK, orchestrating a complete voice
 * pipeline from speech recognition through language model processing to speech
 * synthesis.
 *
 * @remarks
 * `CompositeVoice` composes three pluggable provider types -- STT, LLM, and TTS --
 * into a unified, event-driven voice agent. It manages:
 *
 * - **Provider lifecycle**: Initialization, connection, and disposal of all three
 *   providers.
 * - **State machines**: Four coordinated state machines (audio capture, audio
 *   playback, processing, and an orchestrating agent state machine) that derive
 *   the high-level agent state (`idle`, `ready`, `listening`, `thinking`,
 *   `speaking`, `error`).
 * - **Audio I/O**: SDK-managed `AudioCapture` and `AudioPlayer` for providers
 *   that do not handle their own audio pipelines (i.e., do not cover the
 *   `'input'` or `'output'` roles).
 * - **Turn-taking**: Configurable strategies (`auto`, `conservative`,
 *   `aggressive`, `detect`) that control whether audio capture pauses during
 *   TTS playback to prevent echo.
 * - **Conversation history**: Optional multi-turn memory with configurable
 *   `maxTurns`, sending accumulated context to the LLM.
 * - **Eager LLM pipeline**: Speculative generation triggered by DeepgramFlux
 *   preflight signals, reducing speech-to-first-token latency. If `speech_final`
 *   arrives with different text, the speculative generation is cancelled and
 *   restarted.
 * - **Event emission**: A rich set of typed events covering every stage of the
 *   pipeline, plus wildcard (`'*'`) subscription support.
 *
 * @example Basic lifecycle
 * ```typescript
 * import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     new NativeSTT(),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a helpful assistant.' }),
 *     new NativeTTS(),
 *   ],
 * });
 *
 * // Subscribe to events before initializing
 * agent.on('agent.stateChange', ({ state }) => console.log('State:', state));
 * agent.on('transcription.final', ({ text }) => console.log('User said:', text));
 * agent.on('llm.chunk', ({ chunk }) => process.stdout.write(chunk));
 * agent.on('agent.error', ({ error, context }) => console.error(context, error));
 *
 * await agent.initialize();
 * await agent.startListening();
 *
 * // The pipeline now runs automatically:
 * //   [input] -> STT -> LLM -> TTS -> [output]
 *
 * // When finished:
 * await agent.dispose();
 * ```
 *
 * @example With conversation history and eager LLM
 * ```typescript
 * const agent = new CompositeVoice({
 *   providers: [
 *     new NativeSTT(),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514' }),
 *     new NativeTTS(),
 *   ],
 *   conversationHistory: { enabled: true, maxTurns: 10 },
 *   eagerLLM: { enabled: true, cancelOnTextChange: true },
 * });
 *
 * await agent.initialize();
 * await agent.startListening();
 *
 * // Check history at any time
 * console.log(agent.getHistory());
 *
 * // Clear history to reset context
 * agent.clearHistory();
 * ```
 *
 * @see {@link EventEmitter} for the underlying event system.
 * @see {@link CompositeVoiceConfig} for all configuration options.
 */
export class CompositeVoice {
  private config: CompositeVoiceConfig;
  private events: EventEmitter;
  private logger: Logger;

  // Resolved provider references (extracted from config.providers by role)
  private stt: STTProvider;
  private llm: LLMProvider;
  private tts: TTSProvider;

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

  /**
   * Creates a new CompositeVoice instance with the given provider configuration.
   *
   * @remarks
   * The constructor validates the configuration, initializes the internal event
   * emitter, creates the four state machines (audio capture, audio playback,
   * processing, and the orchestrating agent state machine), and wires up the
   * agent state change listener. It does **not** initialize providers or start
   * listening -- call {@link CompositeVoice.initialize | initialize()} and then
   * {@link CompositeVoice.startListening | startListening()} to begin the pipeline.
   *
   * @param config - The SDK configuration containing a `providers` array with
   *   provider instances, plus optional queue, logging, turn-taking, conversation
   *   history, and eager LLM settings.
   *
   * @throws {@link ConfigurationError}
   * Thrown if the required `stt`, `llm`, or `tts` roles are not covered by the
   * providers array.
   *
   * @example
   * ```typescript
   * const agent = new CompositeVoice({
   *   providers: [
   *     new NativeSTT(),
   *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514' }),
   *     new NativeTTS(),
   *   ],
   *   logging: { enabled: true, level: 'debug' },
   * });
   * ```
   */
  constructor(config: CompositeVoiceConfig) {
    const { stt, llm, tts } = this.resolveProviderRoles(config);
    this.stt = stt;
    this.llm = llm;
    this.tts = tts;
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
   * Resolves STT, LLM, and TTS provider references from the flat providers array.
   *
   * @remarks
   * Finds providers by their declared `roles` property. Each of the three core
   * roles (`stt`, `llm`, `tts`) must be covered by at least one provider.
   * This is an interim resolution step; the full 5-role pipeline resolution
   * (including `input` and `output`) will be implemented by `resolveProviders()`.
   *
   * @param config - The SDK configuration containing the providers array.
   * @returns An object with typed `stt`, `llm`, and `tts` provider references.
   *
   * @throws {@link ConfigurationError}
   * Thrown if the `providers` array is missing, or if any of the required roles
   * (`stt`, `llm`, `tts`) are not covered.
   */
  private resolveProviderRoles(config: CompositeVoiceConfig): {
    stt: STTProvider;
    llm: LLMProvider;
    tts: TTSProvider;
  } {
    if (!config.providers || !Array.isArray(config.providers) || config.providers.length === 0) {
      throw new ConfigurationError(
        'CompositeVoice requires a non-empty providers array'
      );
    }

    const sttProvider = config.providers.find((p) => p.roles.includes('stt'));
    const llmProvider = config.providers.find((p) => p.roles.includes('llm'));
    const ttsProvider = config.providers.find((p) => p.roles.includes('tts'));

    if (!sttProvider || !llmProvider || !ttsProvider) {
      const missing: string[] = [];
      if (!sttProvider) missing.push('stt');
      if (!llmProvider) missing.push('llm');
      if (!ttsProvider) missing.push('tts');
      throw new ConfigurationError(
        `CompositeVoice requires providers covering these roles: ${missing.join(', ')}`
      );
    }

    return {
      stt: sttProvider as unknown as STTProvider,
      llm: llmProvider as unknown as LLMProvider,
      tts: ttsProvider as unknown as TTSProvider,
    };
  }

  /**
   * Initializes the SDK by connecting the agent state machine to its
   * sub-machines and initializing all three providers (STT, LLM, TTS)
   * concurrently.
   *
   * @remarks
   * This method must be called exactly once before {@link startListening} or
   * any other operational method. Calling it a second time logs a warning and
   * returns immediately. On success it emits an `'agent.ready'` event and
   * transitions the agent state machine from `idle` to `ready`.
   *
   * Provider initialization is performed in parallel via `Promise.all`, so if
   * any single provider fails the entire initialization is aborted and the
   * error is both emitted as an `'agent.error'` event and re-thrown.
   *
   * @throws Throws the underlying provider error if any provider's
   *   `initialize()` method rejects.
   *
   * @example
   * ```typescript
   * const agent = new CompositeVoice({ providers: [stt, llm, tts] });
   * agent.on('agent.ready', () => console.log('SDK is ready'));
   * await agent.initialize();
   * ```
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
        this.stt.initialize(),
        this.llm.initialize(),
        this.tts.initialize(),
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
   * Wires up event handlers on the configured STT and TTS providers.
   *
   * @remarks
   * For the STT provider, this registers the `onTranscription` callback that
   * dispatches incoming results to the appropriate event type
   * (`transcription.preflight`, `transcription.speechFinal`,
   * `transcription.final`, or `transcription.interim`) and triggers LLM
   * processing or eager speculation as needed.
   *
   * For Live (WebSocket) TTS providers, this registers `onAudio` and
   * `onMetadata` callbacks to forward audio chunks to the `AudioPlayer` and
   * emit `tts.audio` / `tts.metadata` events. An `AudioPlayer` is created
   * if the provider does not manage its own audio pipeline.
   */
  private setupProviders(): void {
    const { stt, tts } = this;

    // Setup STT provider callbacks (all STT providers have onTranscription)
    stt.onTranscription((result) => {
      if (result.isPreflight) {
        // ── Preflight / eager end-of-turn ──────────────────────────────────
        // DeepgramFlux signals early completion before speech_final.
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
      // Initialize AudioPlayer for Live TTS (unless provider covers the 'output' role)
      if (!tts.roles.includes('output')) {
        this.audioPlayer = new AudioPlayer(undefined, this.logger);
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
   * Starts a speculative ("eager") LLM generation based on a preflight
   * transcript from the STT provider.
   *
   * @remarks
   * When the eager LLM pipeline is enabled, this method fires as soon as the
   * STT provider emits a preflight signal (e.g., DeepgramFlux's early
   * end-of-turn detection). It creates an `AbortController` so the generation
   * can be cancelled if `speech_final` arrives with different text. If a
   * previous speculative generation is already running, it is aborted first.
   *
   * @param text - The provisional transcript text from the preflight event.
   *
   * @see {@link CompositeVoice.handleSpeechFinal | handleSpeechFinal} for
   *   how the confirmed `speech_final` text is reconciled with the eager
   *   generation.
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
   * Handles a confirmed `speech_final` utterance by either reusing an
   * in-flight eager generation or starting a fresh LLM request.
   *
   * @remarks
   * This method implements the reconciliation logic for the eager LLM pipeline:
   *
   * 1. If an eager generation is running **and** its text is sufficiently
   *    similar to the confirmed text (at or above `similarityThreshold`),
   *    the speculative result is accepted and no new request is made.
   * 2. If the similarity is below the threshold and `cancelOnTextChange` is
   *    `true` (default), the eager generation is aborted and a new LLM
   *    request is started with the confirmed text.
   * 3. If the similarity is below the threshold but `cancelOnTextChange` is
   *    `false`, the speculative result is accepted anyway (lowest latency,
   *    small accuracy risk).
   * 4. If no eager generation is running, a normal LLM request is started.
   *
   * @param text - The confirmed final transcript text from the STT provider.
   *
   * @see {@link CompositeVoice.startEagerLLM | startEagerLLM} for the
   *   speculative generation entry point.
   */
  private handleSpeechFinal(text: string): void {
    if (!text.trim()) return;

    if (this.eagerAbortController) {
      const eagerText = this.eagerText;
      const shouldCancel = this.config.eagerLLM?.cancelOnTextChange ?? true;
      const threshold = this.config.eagerLLM?.similarityThreshold ?? 0.8;

      // Compare the preflight text against the confirmed text
      const similarity = eagerText ? textSimilarity(eagerText, text) : 0;

      if (similarity >= threshold) {
        // Similar enough — eager generation is already running; let it complete.
        this.logger.debug('speech_final similar to preflight — using eager generation', {
          similarity,
          threshold,
          preflight: eagerText,
          final: text,
        });
        this.eagerAbortController = null;
        this.eagerText = null;
        return;
      }

      if (shouldCancel) {
        this.logger.debug(
          'speech_final too different from preflight — cancelling eager, restarting',
          { similarity, threshold, preflight: eagerText, final: text }
        );
        this.eagerAbortController.abort();
        this.eagerAbortController = null;
        this.eagerText = null;
        void this.processLLM(text);
      } else {
        // Accept the preflight response even though text changed beyond threshold
        this.logger.debug(
          'speech_final differs but cancelOnTextChange=false — accepting eager response',
          { similarity, threshold }
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
   * Processes the given text through the LLM provider, streaming the response
   * to any Live TTS provider in real-time, and managing state transitions.
   *
   * @remarks
   * This is the core LLM processing pipeline. It:
   *
   * 1. Guards against invalid states (only processes when `listening` or `error`).
   * 2. Transitions the processing state machine to `processing`, then `streaming`.
   * 3. Builds the LLM request, optionally including conversation history.
   * 4. Streams response chunks, emitting `llm.chunk` events and forwarding
   *    text to Live TTS providers via `sendText()`.
   * 5. On completion, emits `llm.complete`, appends to conversation history,
   *    and triggers TTS synthesis (REST or Live finalization).
   * 6. Handles `AbortSignal` for eager pipeline cancellation at every stage,
   *    resetting TTS and playback state on mid-stream abort.
   *
   * @param text - The user's transcribed text to send to the LLM.
   * @param signal - Optional `AbortSignal` for cancelling the generation,
   *   used by the eager/speculative pipeline.
   *
   * @see {@link CompositeVoice.processTTS | processTTS} for REST TTS synthesis.
   * @see {@link CompositeVoice.finalizeLiveTTS | finalizeLiveTTS} for Live TTS finalization.
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
      const { llm, tts } = this;
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
   * Synthesizes the given text through a REST TTS provider and plays the
   * resulting audio.
   *
   * @remarks
   * This method is the REST TTS analogue of {@link finalizeLiveTTS}. It:
   *
   * 1. Optionally pauses audio capture to prevent echo (based on turn-taking
   *    configuration and provider combination).
   * 2. Transitions the playback state machine to `buffering`.
   * 3. Calls `synthesize()` on the REST TTS provider. If the provider manages
   *    its own audio (e.g., NativeTTS via `SpeechSynthesis`), no `AudioPlayer`
   *    is used. Otherwise, the SDK creates an `AudioPlayer` and plays the blob.
   * 4. Transitions playback through `stopped` to `idle`.
   * 5. Resumes audio capture if it was paused.
   * 6. On error, attempts to recover STT capture and emits `tts.error` and
   *    `agent.error` events.
   *
   * @param text - The complete text to synthesize into speech.
   */
  private async processTTS(text: string): Promise<void> {
    this.emitEvent({
      type: 'tts.start',
      text,
      timestamp: Date.now(),
    });

    try {
      const { stt, tts } = this;
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
        if (tts.roles.includes('output')) {
          // Provider covers the 'output' role (e.g. NativeTTS via SpeechSynthesis)
          await tts.synthesize(text);
        } else {
          // SDK-managed TTS: get audio blob and play via AudioPlayer
          if (!this.audioPlayer) {
            this.audioPlayer = new AudioPlayer(undefined, this.logger);
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
        const { stt } = this;

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
   * Finalizes a Live (WebSocket) TTS synthesis session after all LLM text has
   * been streamed, then waits for audio playback to complete.
   *
   * @remarks
   * This is the Live TTS counterpart to {@link processTTS} for REST TTS. The
   * key difference is that audio chunks have already been arriving in real-time
   * during LLM streaming (via `sendText()`), so this method only needs to:
   *
   * 1. Optionally pause audio capture to prevent echo.
   * 2. Call `finalize()` on the Live TTS provider to flush remaining text.
   * 3. Wait for the `AudioPlayer` to drain all queued audio chunks.
   * 4. Transition playback state through `stopped` to `idle`.
   * 5. Resume audio capture if it was paused.
   * 6. On error, attempt to recover STT capture and re-throw after emitting
   *    `tts.error` and `agent.error` events.
   *
   * @param fullText - The complete LLM response text (used for the `tts.start`
   *   event payload).
   *
   * @throws Re-throws any error encountered during TTS finalization or audio
   *   playback, after attempting capture recovery.
   */
  private async finalizeLiveTTS(fullText: string): Promise<void> {
    this.emitEvent({
      type: 'tts.start',
      text: fullText,
      timestamp: Date.now(),
    });

    try {
      const { stt, tts } = this;
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
        const { stt } = this;
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
   * Starts listening for user speech input by connecting the STT provider and,
   * if needed, initializing SDK-managed audio capture.
   *
   * @remarks
   * This method transitions the agent from `ready` (or `idle`) into the
   * `listening` state. The exact behavior depends on the STT provider type:
   *
   * - **Managed audio** (e.g., NativeSTT): The provider handles its own
   *   microphone access. CompositeVoice only calls `connect()` on Live STT
   *   providers.
   * - **SDK-managed audio** (e.g., DeepgramSTT): CompositeVoice creates an
   *   `AudioCapture` instance, connects the Live STT provider, then starts
   *   capturing microphone audio and forwarding it to the provider via
   *   `sendAudio()`.
   *
   * On success, emits an `'audio.capture.start'` event.
   *
   * @throws {@link InvalidStateError}
   * Thrown if the agent is not in the `ready` or `idle` state.
   *
   * @throws Throws the underlying error if STT connection or audio capture
   *   fails, after emitting an `'agent.error'` event.
   *
   * @example
   * ```typescript
   * await agent.initialize();
   * await agent.startListening();
   * // The agent is now transcribing speech in real-time
   * ```
   */
  async startListening(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('ready') && !this.agentStateMachine.is('idle')) {
      throw new InvalidStateError(this.agentStateMachine.getState(), 'start listening');
    }

    this.logger.info('Starting to listen');
    this.captureStateMachine.setStarting();

    try {
      const { stt } = this;

      // Provider covers the 'input' role (e.g. NativeSTT via SpeechRecognition)
      if (stt.roles.includes('input')) {
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
      } else {
        // SDK-managed STT: CompositeVoice captures audio and sends to provider
        if (isLiveSTT(stt)) {
          // Initialize AudioCapture if needed
          if (!this.audioCapture) {
            this.audioCapture = new AudioCapture(undefined, this.logger);
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
   * Stops listening for user speech by halting audio capture and disconnecting
   * the STT provider.
   *
   * @remarks
   * If the agent is not currently in the `listening` state, this method logs a
   * warning and returns without error. On success, it transitions the capture
   * state machine to `stopped` and emits an `'audio.capture.stop'` event.
   *
   * @throws Throws the underlying error if stopping audio capture or
   *   disconnecting the STT provider fails.
   *
   * @example
   * ```typescript
   * await agent.startListening();
   * // ... user finishes speaking ...
   * await agent.stopListening();
   * ```
   */
  async stopListening(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('listening')) {
      this.logger.warn('Not currently listening');
      return;
    }

    this.logger.info('Stopping listening');

    try {
      const { stt } = this;

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
   * Stops the agent from speaking by cancelling TTS playback and disconnecting
   * any Live TTS provider.
   *
   * @remarks
   * If the agent is not currently in the `speaking` state, this method returns
   * silently. Otherwise it stops the `AudioPlayer`, disconnects any Live TTS
   * WebSocket, transitions the playback state machine back to `idle`, and emits
   * a `'tts.complete'` event.
   *
   * This is useful for implementing "barge-in" behavior where the user
   * interrupts the agent mid-speech.
   *
   * @throws Throws the underlying error if stopping playback or disconnecting
   *   the TTS provider fails.
   *
   * @example
   * ```typescript
   * agent.on('transcription.interim', async ({ text }) => {
   *   // Barge-in: stop the agent if the user starts speaking
   *   if (agent.getState() === 'speaking') {
   *     await agent.stopSpeaking();
   *   }
   * });
   * ```
   */
  async stopSpeaking(): Promise<void> {
    this.assertInitialized();

    if (!this.agentStateMachine.is('speaking')) {
      this.logger.debug('stopSpeaking() called but not currently speaking');
      return;
    }

    try {
      const { tts } = this;

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
   * Registers an event listener for the specified event type.
   *
   * @remarks
   * Supports all typed SDK events as well as the wildcard `'*'` to receive
   * every event. The returned function can be called to unsubscribe.
   *
   * @typeParam T - The event type string, inferred from the `event` argument.
   *
   * @param event - The event type to listen for (e.g., `'agent.stateChange'`,
   *   `'transcription.final'`), or `'*'` to listen for all events.
   * @param listener - The callback function invoked when the event fires. The
   *   callback receives the typed event payload matching `T`.
   * @returns A function that, when called, removes this listener.
   *
   * @example
   * ```typescript
   * // Typed event listener
   * const unsubscribe = agent.on('llm.chunk', ({ chunk, accumulated }) => {
   *   console.log('LLM chunk:', chunk);
   * });
   *
   * // Wildcard listener for logging
   * agent.on('*', (event) => {
   *   console.log(`[${event.type}]`, event);
   * });
   *
   * // Later, remove the listener
   * unsubscribe();
   * ```
   *
   * @see {@link CompositeVoice.once | once} for one-time listeners.
   * @see {@link CompositeVoice.off | off} for manual removal.
   */
  on<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Registers a one-time event listener that automatically unsubscribes after
   * the first invocation.
   *
   * @typeParam T - The event type string, inferred from the `event` argument.
   *
   * @param event - The event type to listen for.
   * @param listener - The callback function invoked once when the event fires.
   * @returns A function that, when called, removes this listener before it fires.
   *
   * @example
   * ```typescript
   * agent.once('agent.ready', () => {
   *   console.log('Agent is ready (this fires only once)');
   * });
   * ```
   */
  once<T extends EventType>(event: T, listener: EventListenerMap[T]): () => void {
    return this.events.once(event, listener);
  }

  /**
   * Removes a previously registered event listener.
   *
   * @typeParam T - The event type string, inferred from the `event` argument.
   *
   * @param event - The event type the listener was registered for, or `'*'`.
   * @param listener - The exact listener function reference that was passed to
   *   {@link CompositeVoice.on | on}.
   *
   * @example
   * ```typescript
   * const handler = ({ state }: { state: AgentState }) => console.log(state);
   * agent.on('agent.stateChange', handler);
   *
   * // Later, remove it manually
   * agent.off('agent.stateChange', handler);
   * ```
   */
  off<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): void {
    this.events.off(event, listener);
  }

  /**
   * Emits a {@link CompositeVoiceEvent} synchronously to all registered
   * listeners, including wildcard (`'*'`) subscribers.
   *
   * @param event - The fully-formed event object to emit.
   */
  private emitEvent(event: CompositeVoiceEvent): void {
    this.events.emitSync(event);
  }

  /**
   * Emits an `'agent.error'` event and transitions the agent state machine to
   * the `error` state in a single atomic operation.
   *
   * @remarks
   * This helper centralizes the error-emission-plus-state-transition pattern so
   * the two calls are never accidentally separated across the codebase.
   *
   * @param error - The error that occurred.
   * @param context - A string identifying where the error originated
   *   (e.g., `'initialize'`, `'processLLM'`, `'startListening'`).
   * @param recoverable - Whether the error is considered recoverable. Defaults
   *   to `true`.
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
   * Returns the current high-level agent state.
   *
   * @remarks
   * The agent state is derived by the `AgentStateMachine` from the three
   * sub-state machines (capture, playback, processing). Possible values are:
   * `'idle'`, `'ready'`, `'listening'`, `'thinking'`, `'speaking'`, and
   * `'error'`.
   *
   * @returns The current {@link AgentState}.
   *
   * @example
   * ```typescript
   * if (agent.getState() === 'listening') {
   *   console.log('Agent is currently listening');
   * }
   * ```
   */
  getState(): AgentState {
    return this.agentStateMachine.getState();
  }

  /**
   * Returns a shallow copy of the current conversation history.
   *
   * @remarks
   * The returned array contains `LLMMessage` objects with `role` (`'user'` or
   * `'assistant'`) and `content` fields, in chronological order. If
   * conversation history is not enabled in the configuration, or no turns have
   * occurred yet, an empty array is returned.
   *
   * The array is a copy, so modifications do not affect the internal history.
   *
   * @returns A new array of {@link LLMMessage} objects representing the
   *   conversation so far.
   *
   * @example
   * ```typescript
   * const history = agent.getHistory();
   * console.log(`${history.length} messages in history`);
   * for (const msg of history) {
   *   console.log(`[${msg.role}]: ${msg.content}`);
   * }
   * ```
   */
  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clears all accumulated conversation history.
   *
   * @remarks
   * After calling this method, the next LLM request will have no prior context
   * (unless new turns accumulate). This is useful for resetting the
   * conversation topic without disposing the entire agent.
   *
   * @example
   * ```typescript
   * agent.clearHistory();
   * console.log(agent.getHistory().length); // 0
   * ```
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.logger.debug('Conversation history cleared');
  }

  /**
   * Checks whether the SDK has been successfully initialized.
   *
   * @remarks
   * Returns `true` after {@link CompositeVoice.initialize | initialize()} has
   * completed successfully, and `false` before initialization or after
   * {@link CompositeVoice.dispose | dispose()} has been called.
   *
   * @returns `true` if the SDK is initialized and operational, `false` otherwise.
   *
   * @example
   * ```typescript
   * if (!agent.isReady()) {
   *   await agent.initialize();
   * }
   * ```
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Asserts that the SDK has been initialized, throwing if it has not.
   *
   * @remarks
   * Called as a precondition guard at the top of operational methods like
   * {@link startListening}, {@link stopListening}, and {@link stopSpeaking}.
   *
   * @throws {Error}
   * Thrown with the message `'CompositeVoice is not initialized. Call
   * initialize() first.'` if {@link CompositeVoice.initialize | initialize()}
   * has not been called.
   */
  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('CompositeVoice is not initialized. Call initialize() first.');
    }
  }

  /**
   * Disposes of the SDK, releasing all resources including providers, state
   * machines, audio I/O, event listeners, and conversation history.
   *
   * @remarks
   * This method performs a full teardown in the following order:
   *
   * 1. Stops listening and speaking if the agent is in those states.
   * 2. Aborts any in-flight eager LLM generation.
   * 3. Clears conversation history.
   * 4. Stops and disposes SDK-managed `AudioCapture` and `AudioPlayer`.
   * 5. Disposes all three providers concurrently (they handle their own
   *    audio cleanup).
   * 6. Removes all event listeners from the internal `EventEmitter`.
   * 7. Resets and disposes all four state machines.
   *
   * After disposal, calling any operational method will throw. If the SDK is
   * already disposed, this method logs a warning and returns immediately.
   *
   * @throws Throws the underlying error if any disposal step fails.
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * await agent.dispose();
   * console.log(agent.isReady()); // false
   * ```
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
        this.stt.dispose(),
        this.llm.dispose(),
        this.tts.dispose(),
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
