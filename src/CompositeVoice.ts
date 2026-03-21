/**
 * Main CompositeVoice SDK module providing the primary public API for the
 * 5-role audio pipeline.
 *
 * @remarks
 * This module exports the {@link CompositeVoice} class, which orchestrates the
 * full 5-role audio pipeline:
 *
 * ```
 * [InputProvider] -> InputQueue -> [STT] -> [LLM] -> [TTS] -> OutputQueue -> [OutputProvider]
 * ```
 *
 * It manages provider lifecycles, state machines, audio buffering, event
 * emission, conversation history, and the eager/speculative LLM pipeline.
 *
 * The race condition where Deepgram missed first audio frames is fixed by
 * {@link AudioBufferQueue}: audio is buffered while the STT WebSocket handshake
 * completes, then flushed in order when the connection is ready.
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
  LLMToolCall,
  ToolAwareLLMProvider,
  ResolvedPipeline,
  BaseProvider,
} from './core/types/providers';
import type { AudioChunk } from './core/types/audio';
import { AgentStateMachine } from './core/state/AgentStateMachine';
import { SimpleAudioCaptureStateMachine as AudioCaptureStateMachine } from './core/state/SimpleAudioCaptureStateMachine';
import { SimpleAudioPlaybackStateMachine as AudioPlaybackStateMachine } from './core/state/SimpleAudioPlaybackStateMachine';
import { SimpleProcessingStateMachine as ProcessingStateMachine } from './core/state/SimpleProcessingStateMachine';
import { Logger, createLogger } from './utils/logger';
import { InvalidStateError } from './utils/errors';
import { DEFAULT_LOGGING_CONFIG, DEFAULT_TURN_TAKING_CONFIG } from './core/types/config';
import { shouldPauseCaptureOnPlayback } from './utils/turnTaking';
import { textSimilarity } from './utils/textSimilarity';
import { trimConversationHistory } from './utils/conversationHistory';
import { stripMarkdownForTTS } from './utils/ttsStrip';
import { LLMTextRouter } from './utils/LLMTextRouter';
import { getBrowserAPISupport } from './utils/browserCapabilities';
import { resolveProviders } from './core/pipeline/resolveProviders';
import { AudioBufferQueue } from './core/pipeline/AudioBufferQueue';
import type { QueueStats } from './core/pipeline/AudioBufferQueue';
import { AudioHeaderCache } from './core/pipeline/AudioHeaderCache';
import { configureSTTFromMetadata } from './core/pipeline/configureSTTFromMetadata';
import { TTSBackpressure } from './core/pipeline/TTSBackpressure';

/**
 * Type guard that checks whether an STT provider uses a live WebSocket connection.
 *
 * @remarks
 * Live STT providers stream audio in real-time over a WebSocket and support
 * `connect()`, `processAudio()`, and `disconnect()` methods. REST STT providers,
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
 * WebSocket and support `connect()`, `processChunk()`, `finalize()`, and
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

/** Type guard: does this LLM provider support tool use? */
function isToolAware(provider: LLMProvider): provider is ToolAwareLLMProvider {
  return typeof (provider as ToolAwareLLMProvider).generateWithTools === 'function';
}

/**
 * The primary class of the CompositeVoice SDK, orchestrating a complete 5-role
 * audio pipeline from input capture through speech recognition, language model
 * processing, speech synthesis, to audio output.
 *
 * @remarks
 * `CompositeVoice` resolves a flat array of providers into a typed
 * {@link ResolvedPipeline} covering five roles (`input`, `stt`, `llm`, `tts`,
 * `output`), then wires them together with {@link AudioBufferQueue} instances
 * to prevent race conditions and an {@link AudioHeaderCache} for WebSocket
 * reconnection scenarios. It manages:
 *
 * - **5-role pipeline**: Providers are resolved via {@link resolveProviders} into
 *   a typed pipeline. Multi-role providers (e.g., NativeSTT covering `input`+`stt`)
 *   use simplified paths without queues.
 * - **Race condition fix**: An `AudioBufferQueue` between the input provider and
 *   STT buffers audio frames during the WebSocket handshake, then flushes them
 *   in order when `startDraining()` is called.
 * - **Provider lifecycle**: Initialization, connection, and disposal of all
 *   providers, with deduplication for multi-role instances (using `Set`).
 * - **State machines**: Four coordinated state machines (audio capture, audio
 *   playback, processing, and an orchestrating agent state machine) that derive
 *   the high-level agent state (`idle`, `ready`, `listening`, `thinking`,
 *   `speaking`, `error`).
 * - **Turn-taking**: Configurable strategies (`auto`, `conservative`,
 *   `aggressive`, `detect`) that control whether audio capture pauses during
 *   TTS playback to prevent echo. Pause/resume stops/starts queue draining,
 *   pauses/resumes input, disconnects/reconnects STT with header re-injection.
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
 * //   [input] -> InputQueue -> [stt] -> [llm] -> [tts] -> OutputQueue -> [output]
 *
 * // When finished:
 * await agent.dispose();
 * ```
 *
 * @example With explicit 5-provider config
 * ```typescript
 * import {
 *   CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM,
 *   DeepgramTTS, BrowserAudioOutput,
 * } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     new MicrophoneInput(),
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514' }),
 *     new DeepgramTTS({ apiKey: '...' }),
 *     new BrowserAudioOutput(),
 *   ],
 *   queue: {
 *     input: { maxSize: 2000 },
 *     output: { maxSize: 500 },
 *   },
 * });
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
 * @see {@link resolveProviders} for the provider resolution algorithm.
 * @see {@link AudioBufferQueue} for the queue that fixes the race condition.
 * @see {@link AudioHeaderCache} for header caching on reconnection.
 */
export class CompositeVoice {
  private config: CompositeVoiceConfig;
  private events: EventEmitter;
  private logger: Logger;

  /** The resolved 5-role pipeline with a provider assigned to each slot. */
  private pipeline: ResolvedPipeline;

  // Convenience aliases for the 3 core providers
  private stt: STTProvider;
  private llm: LLMProvider;
  private tts: TTSProvider;

  /**
   * Audio buffer queue between input and STT providers.
   *
   * @remarks
   * Buffers audio frames while the STT WebSocket handshake completes,
   * then flushes them in order via `startDraining()`. Only used when
   * input and STT are separate providers (not multi-role).
   */
  private inputQueue: AudioBufferQueue;

  /**
   * Audio buffer queue between TTS and output providers.
   *
   * @remarks
   * Buffers audio chunks from the TTS provider for the output provider.
   * Only used when TTS and output are separate providers (not multi-role).
   */
  private outputQueue: AudioBufferQueue;

  /**
   * Caches the audio container header for re-injection on WebSocket reconnection.
   *
   * @remarks
   * Only used when input and STT are separate providers. The first audio
   * chunks are sniffed for container format (WAV, OGG, etc.) and the header
   * is cached. On STT reconnection, the cached header is re-sent so the
   * remote service can resume parsing audio frames.
   */
  private headerCache: AudioHeaderCache;

  // State machines
  private captureStateMachine: AudioCaptureStateMachine;
  private playbackStateMachine: AudioPlaybackStateMachine;
  private processingStateMachine: ProcessingStateMachine;
  private agentStateMachine: AgentStateMachine;

  // Conversation history (when enabled via config)
  private conversationHistory: LLMMessage[] = [];

  // Audio output mute state (TTS still runs but audio is not played)
  private _outputMuted = false;

  // Input mute state — tracked explicitly so we can report it to the LLM
  // even when capture state machine transitions happen for other reasons
  private _inputMuted = false;

  /**
   * Build an I/O context system message that tells the LLM about the current
   * interaction modality. This is prepended to the messages array so the LLM
   * can adapt its response style.
   */
  /**
   * Check browser capabilities and log warnings for providers that may not work.
   */
  private checkBrowserCapabilities(): void {
    const apis = getBrowserAPISupport();
    const sttName = this.pipeline.stt.constructor.name;
    const ttsName = this.pipeline.tts.constructor.name;

    if (sttName === 'NativeSTT' && !apis.speechRecognition) {
      this.logger.error(
        'NativeSTT requires the Web Speech API (SpeechRecognition) which is not available in this browser. ' +
          'Use DeepgramSTT or another cloud STT provider instead.'
      );
    }

    if (ttsName === 'NativeTTS' && !apis.speechSynthesis) {
      this.logger.error(
        'NativeTTS requires the SpeechSynthesis API which is not available in this browser. ' +
          'Use DeepgramTTS or another cloud TTS provider instead.'
      );
    }

    if (!apis.audioContext) {
      this.logger.warn('AudioContext is not available. Audio playback may not work.');
    }

    if (
      !apis.mediaDevices &&
      (sttName === 'DeepgramSTT' || sttName === 'AssemblyAISTT' || sttName === 'ElevenLabsSTT')
    ) {
      this.logger.error(
        `${sttName} requires navigator.mediaDevices.getUserMedia which is not available. ` +
          'Are you on HTTPS? getUserMedia requires a secure context.'
      );
    }
  }

  private buildIOContextMessage(modality: 'voice' | 'text'): LLMMessage | null {
    const ioConfig = this.config.ioContext;
    if (ioConfig?.enabled === false) return null;

    const inputMode = this._inputMuted ? 'text' : 'voice';
    const outputMode = this._outputMuted ? 'text' : 'voice';
    const format = ioConfig?.format ?? 'frontmatter';
    const includeGuidance = ioConfig?.includeFormatGuidance !== false;

    if (format === 'frontmatter') {
      const lines = [
        '---',
        'sdk_context:',
        `  input: ${inputMode}${inputMode === 'voice' ? ' (microphone → speech-to-text)' : ' (typed)'}`,
        `  output: ${outputMode}${outputMode === 'voice' ? ' (text-to-speech → speaker)' : ' (displayed as text)'}`,
      ];

      if (modality !== inputMode) {
        lines.push(`  this_message: ${modality === 'text' ? 'typed' : 'spoken'}`);
      }

      if (includeGuidance) {
        if (outputMode === 'voice') {
          lines.push('  format: plain text only, no markdown');
          lines.push('  style: concise, conversational, natural sentences');
        } else {
          lines.push('  format: plain text, no markdown');
          lines.push('  style: clear, well-structured sentences');
        }
      }

      lines.push('---');

      return { role: 'system', content: lines.join('\n') };
    }

    // Prose format (legacy)
    const parts: string[] = [];

    if (inputMode === 'voice') {
      parts.push('The user is speaking to you through a microphone (speech-to-text).');
    } else {
      parts.push('The user is typing to you.');
    }

    if (includeGuidance) {
      if (outputMode === 'voice') {
        parts.push(
          'Your response will be spoken aloud via text-to-speech. Keep responses concise and conversational. Never use markdown, code blocks, bullet points, or numbered lists. Respond in plain, natural sentences.'
        );
      } else {
        parts.push(
          'Your response will be displayed as text. Keep responses clear and well-structured. Do not use markdown formatting. Respond in plain text.'
        );
      }
    }

    if (modality !== inputMode) {
      parts.push(`Note: this specific message was ${modality === 'text' ? 'typed' : 'spoken'}.`);
    }

    return { role: 'system', content: parts.join(' ') };
  }

  // Eager LLM pipeline state (preflight / speculative generation)
  private eagerAbortController: AbortController | null = null;
  private eagerText: string | null = null;

  /** AbortController for the current LLM generation (non-eager). */
  private llmAbortController: AbortController | null = null;

  /** Monotonic generation ID — incremented on each processLLM call so stale
   *  generations can detect they've been superseded by a barge-in. */
  private llmGenerationId = 0;

  // LLM→TTS backpressure (when config.pipeline.maxPendingChunks is set)
  private ttsBackpressure: TTSBackpressure | null = null;

  private initialized = false;

  /**
   * Whether the input and STT providers are the same multi-role instance.
   *
   * @remarks
   * When `true`, the input provider manages its own audio capture and feeds
   * it directly to the STT engine (e.g., NativeSTT via SpeechRecognition).
   * No `AudioBufferQueue` or `AudioHeaderCache` is needed. When `false`,
   * audio flows through the input queue with the race condition fix.
   */
  private get isMultiRoleInput(): boolean {
    return Object.is(this.pipeline.input, this.pipeline.stt);
  }

  /**
   * Whether the TTS and output providers are the same multi-role instance.
   *
   * @remarks
   * When `true`, the TTS provider handles its own audio playback (e.g.,
   * NativeTTS via SpeechSynthesis). No output queue or separate output
   * provider wiring is needed. When `false`, audio flows through the
   * output queue to the output provider.
   */
  private get isMultiRoleOutput(): boolean {
    return Object.is(this.pipeline.tts, this.pipeline.output);
  }

  /**
   * Creates a new CompositeVoice instance with the given provider configuration.
   *
   * @remarks
   * The constructor resolves the `providers` array into a typed
   * {@link ResolvedPipeline} via {@link resolveProviders}, creates input and
   * output {@link AudioBufferQueue} instances, initializes the
   * {@link AudioHeaderCache}, creates the four state machines, and wires up
   * the agent state change listener. It does **not** initialize providers or
   * start listening -- call {@link CompositeVoice.initialize | initialize()}
   * and then {@link CompositeVoice.startListening | startListening()} to
   * begin the pipeline.
   *
   * @param config - The SDK configuration containing a `providers` array with
   *   provider instances, plus optional queue, logging, turn-taking, conversation
   *   history, and eager LLM settings.
   *
   * @throws {@link ConfigurationError}
   * Thrown if the required roles are not covered by the providers array,
   * if duplicate roles are found, or if providers fail duck-type validation.
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
    // Resolve providers into a fully typed 5-role pipeline
    this.pipeline = resolveProviders(config.providers);
    this.stt = this.pipeline.stt;
    this.llm = this.pipeline.llm;
    this.tts = this.pipeline.tts;
    this.config = config;

    // Create audio buffer queues (configurable via config.queue)
    this.inputQueue = new AudioBufferQueue({
      name: 'input',
      maxSize: 1000,
      overflowStrategy: 'drop-oldest',
      ...config.queue?.input,
    });
    this.outputQueue = new AudioBufferQueue({
      name: 'output',
      maxSize: 1000,
      overflowStrategy: 'drop-oldest',
      ...config.queue?.output,
    });

    // Create header cache for WebSocket reconnection
    this.headerCache = new AudioHeaderCache();

    // Setup LLM→TTS backpressure (opt-in via config)
    const maxPending = config.pipeline?.maxPendingChunks;
    if (maxPending && maxPending > 0) {
      this.ttsBackpressure = new TTSBackpressure(maxPending);
    }

    // Setup logging
    const loggingConfig = { ...DEFAULT_LOGGING_CONFIG, ...config.logging };
    this.logger = createLogger('CompositeVoice', loggingConfig);

    // Initialize event emitter
    this.events = new EventEmitter();

    // Wire queue overflow events to the event emitter
    this.inputQueue.onOverflow((droppedChunks, currentSize) => {
      this.events.emitSync({
        type: 'queue.overflow',
        queueName: 'input',
        droppedChunks,
        currentSize,
        timestamp: Date.now(),
      });
    });
    this.outputQueue.onOverflow((droppedChunks, currentSize) => {
      this.events.emitSync({
        type: 'queue.overflow',
        queueName: 'output',
        droppedChunks,
        currentSize,
        timestamp: Date.now(),
      });
    });

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
   * Initializes the SDK by connecting the agent state machine to its
   * sub-machines and initializing all pipeline providers concurrently.
   *
   * @remarks
   * This method must be called exactly once before {@link startListening} or
   * any other operational method. Calling it a second time logs a warning and
   * returns immediately. On success it emits an `'agent.ready'` event and
   * transitions the agent state machine from `idle` to `ready`.
   *
   * Multi-role providers are deduplicated using a `Set` so that a provider
   * covering both `input` and `stt` (e.g., NativeSTT) is only initialized
   * once. All unique providers are initialized concurrently via `Promise.all`.
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

      // Check browser capabilities and warn about potential issues
      if (typeof window !== 'undefined') {
        this.checkBrowserCapabilities();
      }

      // Deduplicate multi-role provider instances (e.g., NativeSTT is both input + stt)
      const uniqueProviders = new Set<BaseProvider>([
        this.pipeline.input,
        this.pipeline.stt,
        this.pipeline.llm,
        this.pipeline.tts,
        this.pipeline.output,
      ]);
      await Promise.all([...uniqueProviders].map((p) => p.initialize()));

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
   * `onMetadata` callbacks. When TTS and output are separate providers,
   * audio flows through the output queue: `tts.onAudio -> outputQueue ->
   * output.enqueue`. When they are multi-role, audio is handled internally
   * by the provider. The output queue starts draining immediately since the
   * output provider has no async connection handshake.
   */
  private setupProviders(): void {
    const { stt, tts, pipeline } = this;

    // Setup STT provider callbacks (all STT providers have onTranscription)
    stt.onTranscription((result) => {
      // ── Error results from STT providers ──────────────────────────────
      if (result.metadata?.error && !result.text?.trim()) {
        const errorMsg =
          (result.metadata.message as string) || `STT error: ${result.metadata.error}`;
        this.logger.error('STT provider error', errorMsg);
        this.emitEvent({
          type: 'transcription.error',
          error: new Error(errorMsg),
          timestamp: Date.now(),
        } as CompositeVoiceEvent);
        this.emitAgentError(new Error(errorMsg), 'stt', true);
        return;
      }

      // ── Barge-in: interrupt playback when user starts speaking ──────────
      if (
        (this.agentStateMachine.is('speaking') || this.agentStateMachine.is('thinking')) &&
        result.text?.trim()
      ) {
        this.logger.debug('Barge-in detected — stopping playback');
        // Synchronously abort LLM + reset state machines so processLLM
        // can start immediately in this same callback
        if (this.llmAbortController) {
          this.llmAbortController.abort();
          this.llmAbortController = null;
        }
        if (this.eagerAbortController) {
          this.eagerAbortController.abort();
          this.eagerAbortController = null;
          this.eagerText = null;
        }
        // Stop output immediately (sync)
        if (!this.isMultiRoleOutput) {
          this.outputQueue.clear();
          this.pipeline.output.stop();
        }
        // Reset state machines so agent can process new input
        const ps = this.playbackStateMachine.getState();
        if (ps !== 'idle' && ps !== 'error') {
          try {
            this.playbackStateMachine.setStopped();
          } catch {
            /* ignore */
          }
          try {
            this.playbackStateMachine.setIdle();
          } catch {
            /* ignore */
          }
        }
        const prs = this.processingStateMachine.getState();
        if (prs !== 'idle') {
          try {
            this.processingStateMachine.setIdle();
          } catch {
            /* ignore */
          }
        }
        // Disconnect TTS in background (async, don't block)
        if (isLiveTTS(tts)) {
          void tts.disconnect();
        }
      }

      if (stt.isPreflight(result)) {
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

      if (stt.isUtteranceComplete(result) && result.text.trim()) {
        // ── Utterance complete — provider says "send to LLM now" ─────────
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
      } else if (stt.isFinal(result)) {
        // ── Segment finalised but not utterance-complete ─────────────────
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

    // Setup TTS provider callbacks (only Live TTS has onAudio/onMetadata)
    if (isLiveTTS(tts)) {
      if (this.isMultiRoleOutput) {
        // Multi-role tts===output: no queue needed, TTS handles playback internally.
        // Track playback state for agent state machine derivation.
        tts.onAudio((chunk) => {
          if (!tts.isAudioReady(chunk)) return;
          this.ttsBackpressure?.release();
          this.emitEvent({
            type: 'tts.audio',
            chunk,
            timestamp: Date.now(),
          });

          if (this.playbackStateMachine.getState() === 'idle') {
            this.playbackStateMachine.setBuffering();
          }
        });

        tts.onMetadata((metadata) => {
          this.emitEvent({
            type: 'tts.metadata',
            metadata,
            timestamp: Date.now(),
          });
        });
      } else {
        // Separate TTS and output: wire audio through output queue
        tts.onAudio((chunk) => {
          if (!tts.isAudioReady(chunk)) return;
          this.ttsBackpressure?.release();
          this.emitEvent({
            type: 'tts.audio',
            chunk,
            timestamp: Date.now(),
          });

          // Track playback state for agent state machine
          if (this.playbackStateMachine.getState() === 'idle') {
            this.playbackStateMachine.setBuffering();
          }
          this.outputQueue.enqueue(chunk);
        });

        // Wire metadata to output provider for format configuration
        tts.onMetadata((metadata) => {
          this.emitEvent({
            type: 'tts.metadata',
            metadata,
            timestamp: Date.now(),
          });
          pipeline.output.configure(metadata);
        });

        // Start draining output queue to output provider immediately
        // (no async handshake needed for output, unlike input→STT)
        this.outputQueue.startDraining((chunk: AudioChunk) => {
          pipeline.output.enqueue(chunk);
        });
      }
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
   *    text to Live TTS providers via `processChunk()`.
   * 5. On completion, emits `llm.complete`, appends to conversation history,
   *    and triggers TTS synthesis (REST or Live finalization).
   * 6. Handles `AbortSignal` for eager pipeline cancellation at every stage,
   *    resetting TTS, output provider, and playback state on mid-stream abort.
   *
   * @param text - The user's transcribed text to send to the LLM.
   * @param signal - Optional `AbortSignal` for cancelling the generation,
   *   used by the eager/speculative pipeline.
   *
   * @see {@link CompositeVoice.processTTS | processTTS} for REST TTS synthesis.
   * @see {@link CompositeVoice.finalizeLiveTTS | finalizeLiveTTS} for Live TTS finalization.
   */
  private async processLLM(
    text: string,
    signal?: AbortSignal,
    modality: 'voice' | 'text' = 'voice'
  ): Promise<void> {
    // Tag this generation so we can detect if it's been superseded by barge-in
    const generationId = ++this.llmGenerationId;

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

      // Create an abort controller for this generation (used by barge-in)
      const llmController = new AbortController();
      this.llmAbortController = llmController;
      // Use the eager signal if provided, otherwise use our own
      const activeSignal = signal ?? llmController.signal;

      // Build message list and get response iterable
      const ioContext = this.buildIOContextMessage(modality);

      if (useHistory) {
        this.conversationHistory.push({ role: 'user', content: text, modality });
        // Trim history using token-aware trimming (preserves system messages by default)
        this.conversationHistory = trimConversationHistory(this.conversationHistory, historyConfig);
      }

      // Tool-aware path: delegate to tool loop which handles TTS internally
      if (this.config.tools && isToolAware(llm) && useHistory) {
        this.processingStateMachine.setStreaming();
        const msgs = [...(ioContext ? [ioContext] : []), ...this.conversationHistory];
        const fullResponse = await this.processLLMToolLoop(msgs, activeSignal, generationId);

        if (generationId !== this.llmGenerationId) return;
        if (activeSignal.aborted) {
          this.processingStateMachine.setIdle();
          return;
        }
        this.llmAbortController = null;

        this.processingStateMachine.setComplete();
        this.emitEvent({ type: 'llm.complete', text: fullResponse, timestamp: Date.now() });

        if (useHistory && fullResponse) {
          this.conversationHistory.push({ role: 'assistant', content: fullResponse });
        }

        if (!this._outputMuted && fullResponse.trim()) {
          if (isLiveTTS(tts)) {
            await this.finalizeLiveTTS(fullResponse);
          } else if (isRestTTS(tts)) {
            await this.processTTS(fullResponse);
          }
        }

        if (generationId === this.llmGenerationId) {
          this.processingStateMachine.setIdle();
        }
        return;
      }

      // Text-only fallback path
      let responseIterable: AsyncIterable<string>;
      if (useHistory) {
        responseIterable = await llm.generateFromMessages(
          [...(ioContext ? [ioContext] : []), ...this.conversationHistory],
          { signal: activeSignal }
        );
      } else {
        responseIterable = await llm.generate(text, { signal: activeSignal });
      }

      // Check if aborted before we start streaming (processMessages/processText may have taken time)
      if (activeSignal.aborted) {
        this.processingStateMachine.setIdle();
        return;
      }

      let fullResponse = '';
      let abortedMidStream = false;

      // Ensure Live TTS WebSocket is connected before streaming begins
      if (isLiveTTS(tts) && !this._outputMuted) {
        await tts.connect();
      }

      // Stream LLM response
      this.processingStateMachine.setStreaming();
      let hasCodeBlock = false;

      for await (const chunk of responseIterable) {
        if (activeSignal.aborted) {
          abortedMidStream = true;
          break;
        }

        fullResponse += chunk;
        const spokenChunk = stripMarkdownForTTS(chunk);
        this.emitEvent({
          type: 'llm.chunk',
          chunk,
          accumulated: fullResponse,
          visual: chunk,
          spoken: spokenChunk,
          timestamp: Date.now(),
        });

        // Stop streaming to TTS as soon as we detect a code block (e.g. ```skill)
        if (!hasCodeBlock && fullResponse.includes('```')) {
          hasCodeBlock = true;
        }

        // If TTS is Live (WebSocket), send chunks in real-time (unless output muted)
        // Skip entirely once a code block is detected — the response contains a
        // skill invocation and shouldn't be spoken
        if (isLiveTTS(tts) && !this._outputMuted && !hasCodeBlock) {
          if (this.ttsBackpressure) {
            await this.ttsBackpressure.waitForCapacity();
            tts.sendText(chunk);
            this.ttsBackpressure.acquire();
          } else {
            tts.sendText(chunk);
          }
        }
      }

      // If this generation was superseded by barge-in, bail out silently.
      // The barge-in already cleaned up state machines and started a new generation.
      if (generationId !== this.llmGenerationId) {
        this.logger.debug('LLM generation superseded by barge-in — bailing out');
        return;
      }

      this.llmAbortController = null;

      if (abortedMidStream) {
        // Generation was cancelled mid-stream (eager, not barge-in).
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
        if (!this.isMultiRoleOutput) {
          this.outputQueue.clear();
          this.pipeline.output.stop();
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

      // TTS — skip entirely when output is muted (text events still emitted above)
      if (!this._outputMuted && !hasCodeBlock) {
        if (isRestTTS(tts)) {
          await this.processTTS(fullResponse);
        } else if (isLiveTTS(tts)) {
          await this.finalizeLiveTTS(fullResponse);
        }
      }

      // Processing complete, reset to idle
      if (generationId === this.llmGenerationId) {
        this.processingStateMachine.setIdle();
      }
    } catch (error) {
      // If superseded by barge-in, don't touch state
      if (generationId !== this.llmGenerationId) return;

      if ((error as Error).name === 'AbortError') {
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
   * resulting audio through the output provider.
   *
   * @remarks
   * This method is the REST TTS analogue of {@link finalizeLiveTTS}. It:
   *
   * 1. Optionally pauses audio capture to prevent echo (based on turn-taking
   *    configuration and provider combination). For separate input providers,
   *    this stops queue draining and pauses the input.
   * 2. Transitions the playback state machine to `buffering`.
   * 3. Calls `synthesize()` on the REST TTS provider. If the provider manages
   *    its own audio (multi-role `tts === output`, e.g., NativeTTS), no
   *    separate output is needed. Otherwise, the synthesized blob is converted
   *    to an {@link AudioChunk} and enqueued on the output provider.
   * 4. Transitions playback through `stopped` to `idle`.
   * 5. Resumes audio capture if it was paused, re-injecting the cached header
   *    and restarting queue draining for separate input providers.
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
      const { stt, tts, pipeline } = this;
      const turnTakingConfig = { ...DEFAULT_TURN_TAKING_CONFIG, ...this.config.turnTaking };
      const shouldPause = shouldPauseCaptureOnPlayback(turnTakingConfig, stt, tts, this.logger);

      // Optionally pause capture while speaking to prevent echo
      const captureState = this.captureStateMachine.getState();
      if (shouldPause && captureState === 'active') {
        this.captureStateMachine.setPaused();
        // For separate input: stop draining and pause input provider
        if (!this.isMultiRoleInput) {
          this.inputQueue.stopDraining();
          pipeline.input.pause();
        }
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
        if (this.isMultiRoleOutput) {
          // Provider covers the 'output' role (e.g. NativeTTS via SpeechSynthesis)
          await tts.synthesize(text);
        } else {
          // Separate output: synthesize to Blob, convert to AudioChunk, enqueue
          const audioBlob = await tts.synthesize(text);
          const arrayBuffer = await audioBlob.arrayBuffer();
          const chunk: AudioChunk = { data: arrayBuffer, timestamp: Date.now() };
          pipeline.output.enqueue(chunk);
          await pipeline.output.flush();
        }
      }

      // Playback complete: buffering -> stopped -> idle
      this.playbackStateMachine.setStopped();
      this.playbackStateMachine.setIdle();

      // Resume capture based on current state
      const resumeCaptureState = this.captureStateMachine.getState();
      if (resumeCaptureState === 'paused') {
        // paused → active (resume)
        if (!this.isMultiRoleInput) {
          pipeline.input.resume();
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
          // Re-inject cached header for WebSocket reconnection
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
        }
        this.captureStateMachine.setActive();
      } else if (resumeCaptureState === 'error') {
        // error → idle → starting → active
        this.captureStateMachine.setIdle();
        this.captureStateMachine.setStarting();
        if (!this.isMultiRoleInput) {
          pipeline.input.resume();
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
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
        const { stt, pipeline } = this;

        // Recover capture state machine
        const captureState = this.captureStateMachine.getState();
        if (captureState === 'error') {
          // error → idle → starting → active
          this.captureStateMachine.setIdle();
          this.captureStateMachine.setStarting();
        } else if (captureState === 'paused') {
          // paused → active (resume input)
          if (!this.isMultiRoleInput) {
            pipeline.input.resume();
          }
        }

        if (isLiveSTT(stt)) {
          await stt.connect();
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
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
   * during LLM streaming (via `processChunk()`), so this method only needs to:
   *
   * 1. Optionally pause audio capture to prevent echo. For separate input
   *    providers, this stops queue draining and pauses the input.
   * 2. Call `finalize()` on the Live TTS provider to flush remaining text.
   * 3. Wait for the output provider to drain all queued audio chunks (via
   *    `flush()`), or for the multi-role provider to complete internally.
   * 4. Transition playback state through `stopped` to `idle`.
   * 5. Resume audio capture if it was paused, re-injecting the cached header
   *    and restarting queue draining.
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
      const { stt, tts, pipeline } = this;
      const turnTakingConfig = { ...DEFAULT_TURN_TAKING_CONFIG, ...this.config.turnTaking };
      const shouldPause = shouldPauseCaptureOnPlayback(turnTakingConfig, stt, tts, this.logger);

      // Optionally pause capture while audio plays to prevent echo
      const captureState = this.captureStateMachine.getState();
      if (shouldPause && captureState === 'active') {
        this.captureStateMachine.setPaused();
        if (!this.isMultiRoleInput) {
          this.inputQueue.stopDraining();
          pipeline.input.pause();
        }
        if (isLiveSTT(stt)) {
          await stt.disconnect();
        }
      } else if (captureState === 'error') {
        this.logger.warn('Capture in error state during Live TTS, skipping pause');
      }

      if (isLiveTTS(tts)) {
        // Finalize the TTS provider (flushes remaining text)
        await tts.finalize();

        // Wait for output provider to finish playing all audio
        if (!this.isMultiRoleOutput) {
          await pipeline.output.flush();
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
        if (!this.isMultiRoleInput) {
          pipeline.input.resume();
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
        }
        this.captureStateMachine.setActive();
      } else if (resumeCaptureState === 'error') {
        this.captureStateMachine.setIdle();
        this.captureStateMachine.setStarting();
        if (!this.isMultiRoleInput) {
          pipeline.input.resume();
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
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
        const { stt, pipeline } = this;
        const captureState = this.captureStateMachine.getState();
        if (captureState === 'error') {
          this.captureStateMachine.setIdle();
          this.captureStateMachine.setStarting();
        } else if (captureState === 'paused') {
          if (!this.isMultiRoleInput) {
            pipeline.input.resume();
          }
        }
        if (isLiveSTT(stt)) {
          await stt.connect();
          if (!this.isMultiRoleInput) {
            const header = this.headerCache.getHeader();
            if (header) {
              stt.sendAudio(header);
            }
            this.inputQueue.startDraining((chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            });
          }
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
   * Starts listening for user speech input by wiring the input provider to the
   * STT provider through the input queue and header cache.
   *
   * @remarks
   * This method transitions the agent from `ready` (or `idle`) into the
   * `listening` state. The exact behavior depends on the pipeline topology:
   *
   * - **Multi-role input===stt** (e.g., NativeSTT): Simplified path — just
   *   calls `connect()` on the Live STT provider. The provider handles its
   *   own microphone access internally.
   * - **Separate input + STT** (e.g., MicrophoneInput + DeepgramSTT): The
   *   race condition fix is applied:
   *   1. Wire `input.onAudio` → `headerCache.process` → `inputQueue.enqueue`
   *   2. Start the input provider (begins audio capture)
   *   3. Auto-configure STT encoding/sampleRate from input metadata
   *   4. Connect the STT provider (async WebSocket handshake)
   *   5. `inputQueue.startDraining` — flush buffered chunks + switch to pass-through
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
      const { stt, pipeline } = this;

      if (this.isMultiRoleInput) {
        // Multi-role input===stt (e.g., NativeSTT via SpeechRecognition):
        // The provider manages its own audio capture — just connect.
        if (isLiveSTT(stt)) {
          await stt.connect();
        }
      } else {
        // Separate input + STT: apply the race condition fix.
        // 1. Wire input → headerCache → inputQueue
        pipeline.input.onAudio((chunk: AudioChunk) => {
          this.headerCache.process(chunk.data);
          this.inputQueue.enqueue(chunk);
        });

        // 2. Start capturing audio (sync — begins delivering chunks immediately)
        pipeline.input.start();

        // 3. Auto-configure STT from input's audio metadata
        configureSTTFromMetadata(stt, pipeline.input.getMetadata());

        // 4. Connect STT (async — WebSocket handshake happens here)
        // While this is in progress, audio chunks are buffered in the inputQueue.
        if (isLiveSTT(stt)) {
          await stt.connect();
        }

        // 5. Start draining: flush buffered chunks then switch to pass-through.
        //    Use paced mode to avoid overwhelming the WebSocket with a burst of
        //    data — chunks are sent in small batches with event-loop yields
        //    between each batch, giving the proxy/upstream time to relay.
        if (isLiveSTT(stt)) {
          this.inputQueue.startDraining(
            (chunk: AudioChunk) => {
              stt.sendAudio(chunk.data);
            },
            { paced: true }
          );
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
   * Stops listening for user speech by halting audio capture, clearing the
   * input queue, and disconnecting the STT provider.
   *
   * @remarks
   * If the agent is not currently in the `listening` state, this method logs a
   * warning and returns without error. On success, it:
   *
   * 1. Stops draining the input queue
   * 2. Clears the input queue
   * 3. Stops the input provider (for separate input)
   * 4. Disconnects the STT provider
   * 5. Resets the header cache
   * 6. Transitions the capture state machine to `stopped`
   * 7. Emits an `'audio.capture.stop'` event
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
      const { stt, pipeline } = this;

      // Stop draining and clear the input queue
      this.inputQueue.stopDraining();
      this.inputQueue.clear();

      // Stop input provider (for separate input)
      if (!this.isMultiRoleInput) {
        pipeline.input.stop();
      }

      // Disconnect STT provider
      if (isLiveSTT(stt)) {
        await stt.disconnect();
      }

      // Reset header cache for next listening session
      this.headerCache.reset();

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
   * silently. Otherwise it stops the output provider (clearing its queue),
   * disconnects any Live TTS WebSocket, transitions the playback state machine
   * back to `idle`, and emits a `'tts.complete'` event.
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

    if (!this.agentStateMachine.is('speaking') && !this.agentStateMachine.is('thinking')) {
      this.logger.debug('stopSpeaking() called but not currently speaking or thinking');
      return;
    }

    try {
      const { tts } = this;

      // Abort in-flight LLM generation
      if (this.llmAbortController) {
        this.llmAbortController.abort();
        this.llmAbortController = null;
      }
      if (this.eagerAbortController) {
        this.eagerAbortController.abort();
        this.eagerAbortController = null;
        this.eagerText = null;
      }

      // Reset backpressure so stale waitForCapacity promises don't block
      this.ttsBackpressure?.reset();

      // Stop output provider and clear output queue (for separate output)
      if (!this.isMultiRoleOutput) {
        this.outputQueue.clear();
        this.pipeline.output.stop();
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

      // Reset processing state so agent returns to listening/ready
      const processingState = this.processingStateMachine.getState();
      if (processingState !== 'idle') {
        try {
          this.processingStateMachine.setIdle();
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
   * Send a text message directly to the LLM, bypassing speech-to-text.
   *
   * @remarks
   * This allows users to type a message that enters the same pipeline as
   * spoken input. The message is added to conversation history with
   * `modality: 'text'` so the LLM can distinguish typed input from
   * transcribed speech and adapt its response style accordingly.
   *
   * If audio output is not muted, the LLM response will also be spoken
   * via TTS. Use {@link muteOutput} to get text-only responses.
   *
   * @param text - The user's typed message.
   *
   * @example
   * ```typescript
   * // Send a typed message while the agent is listening
   * await agent.sendMessage('What is the weather like?');
   *
   * // Listen for the response
   * agent.on('llm.complete', ({ text }) => {
   *   console.log('Response:', text);
   * });
   * ```
   */
  async sendMessage(text: string): Promise<void> {
    this.assertInitialized();

    if (!text.trim()) return;

    // Barge-in: interrupt if agent is currently speaking or thinking
    if (this.agentStateMachine.is('speaking') || this.agentStateMachine.is('thinking')) {
      await this.stopSpeaking();
    }

    // processLLM guards on 'listening' | 'error' state, but sendMessage
    // should also work when input is muted (agent state = 'ready')
    const state = this.agentStateMachine.getState();
    if (state === 'ready') {
      // Temporarily satisfy the guard by marking processing directly
      await this.processLLMFromText(text);
    } else {
      await this.processLLM(text, undefined, 'text');
    }
  }

  /**
   * Process a text message through the LLM without requiring 'listening' state.
   * Used by sendMessage() when the agent is in 'ready' state (e.g. input muted).
   */
  private async processLLMFromText(text: string): Promise<void> {
    const generationId = ++this.llmGenerationId;

    if (this.processingStateMachine.getState() === 'error') {
      this.processingStateMachine.setIdle();
    }

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

      // Create an abort controller for this generation (used by barge-in)
      const llmController = new AbortController();
      this.llmAbortController = llmController;

      const ioContext = this.buildIOContextMessage('text');

      if (useHistory) {
        this.conversationHistory.push({ role: 'user', content: text, modality: 'text' });
        this.conversationHistory = trimConversationHistory(this.conversationHistory, historyConfig);
      }

      // Tool-aware path: delegate to tool loop which handles TTS internally
      if (this.config.tools && isToolAware(llm) && useHistory) {
        this.processingStateMachine.setProcessing();
        this.processingStateMachine.setStreaming();
        const msgs = [...(ioContext ? [ioContext] : []), ...this.conversationHistory];
        const fullResponse = await this.processLLMToolLoop(
          msgs,
          llmController.signal,
          generationId
        );

        if (generationId !== this.llmGenerationId) return;
        this.llmAbortController = null;

        this.processingStateMachine.setComplete();
        this.emitEvent({ type: 'llm.complete', text: fullResponse, timestamp: Date.now() });

        if (useHistory && fullResponse) {
          this.conversationHistory.push({ role: 'assistant', content: fullResponse });
        }

        // Finalize TTS for the follow-up text
        if (!this._outputMuted && fullResponse.trim()) {
          if (isLiveTTS(tts)) {
            await this.finalizeLiveTTS(fullResponse);
          } else if (isRestTTS(tts)) {
            await this.processTTS(fullResponse);
          }
        }

        if (generationId === this.llmGenerationId) {
          this.processingStateMachine.setIdle();
        }
        return;
      }

      // Text-only fallback path
      let responseIterable: AsyncIterable<string>;
      if (useHistory) {
        responseIterable = await llm.generateFromMessages(
          [...(ioContext ? [ioContext] : []), ...this.conversationHistory],
          { signal: llmController.signal }
        );
      } else {
        responseIterable = await llm.generate(text, { signal: llmController.signal });
      }

      // Ensure Live TTS WebSocket is connected before streaming begins
      if (isLiveTTS(tts) && !this._outputMuted) {
        await tts.connect();
      }

      this.processingStateMachine.setStreaming();
      let hasCodeBlock = false;

      let fullResponse = '';
      for await (const chunk of responseIterable) {
        if (llmController.signal.aborted) break;
        fullResponse += chunk;
        const spokenChunk = stripMarkdownForTTS(chunk);
        this.emitEvent({
          type: 'llm.chunk',
          chunk,
          accumulated: fullResponse,
          visual: chunk,
          spoken: spokenChunk,
          timestamp: Date.now(),
        });

        if (!hasCodeBlock && fullResponse.includes('```')) {
          hasCodeBlock = true;
        }

        if (isLiveTTS(tts) && !this._outputMuted && !hasCodeBlock) {
          tts.sendText(chunk);
        }
      }

      // If superseded by barge-in, bail out
      if (generationId !== this.llmGenerationId) {
        this.logger.debug('LLM generation (text) superseded by barge-in');
        return;
      }

      this.llmAbortController = null;

      // If aborted mid-stream, clean up and return
      if (llmController.signal.aborted) {
        this.logger.debug('LLM generation aborted');
        this.processingStateMachine.setIdle();
        return;
      }

      this.processingStateMachine.setComplete();

      this.emitEvent({
        type: 'llm.complete',
        text: fullResponse,
        timestamp: Date.now(),
      });

      if (useHistory && fullResponse) {
        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
      }

      if (!this._outputMuted && !hasCodeBlock) {
        if (isRestTTS(tts)) {
          await this.processTTS(fullResponse);
        } else if (isLiveTTS(tts)) {
          await this.finalizeLiveTTS(fullResponse);
        }
      }

      if (generationId === this.llmGenerationId) {
        this.processingStateMachine.setIdle();
      }
    } catch (error) {
      if (generationId !== this.llmGenerationId) return;

      if ((error as Error).name === 'AbortError') {
        this.logger.debug('LLM generation aborted via signal');
        this.llmAbortController = null;
        this.processingStateMachine.setIdle();
        return;
      }
      this.processingStateMachine.setError();
      this.emitAgentError(error as Error, 'processLLMFromText');
    }
  }

  /**
   * Process an LLM call with tool support. Handles the tool_use → execute → resume loop.
   *
   * @returns The full text response from the LLM (may be empty if only tool calls occurred).
   */
  private async processLLMToolLoop(
    messages: LLMMessage[],
    signal: AbortSignal,
    _generationId: number
  ): Promise<string> {
    const { llm, tts } = this;
    if (!isToolAware(llm) || !this.config.tools) {
      throw new Error('processLLMToolLoop called but LLM does not support tools');
    }

    const toolConfig = this.config.tools;
    let fullText = '';
    let toolCalls: LLMToolCall[] = [];
    let activeToolArgs = '';
    let activeToolName = '';
    let activeToolId = '';

    const router = new LLMTextRouter(
      (visual, spoken, acc) => this.emitEvent({
        type: 'llm.chunk', chunk: visual, accumulated: acc,
        visual, spoken, timestamp: Date.now(),
      }),
      (spoken) => { if (isLiveTTS(tts) && !this._outputMuted) tts.sendText(spoken); },
    );

    // Ensure Live TTS WebSocket is connected before streaming begins
    if (isLiveTTS(tts) && !this._outputMuted) {
      await tts.connect();
    }

    const responseIterable = await llm.generateWithTools(messages, {
      signal,
      tools: toolConfig.definitions,
    });

    for await (const chunk of responseIterable) {
      if (signal.aborted) break;

      if (chunk.type === 'text') {
        fullText += chunk.text;
        router.push(chunk.text);
      } else if (chunk.type === 'tool_call_start') {
        activeToolId = chunk.toolCall.id;
        activeToolName = chunk.toolCall.name;
        activeToolArgs = '';
      } else if (chunk.type === 'tool_call_delta') {
        activeToolArgs += chunk.argumentsDelta;
      } else if (chunk.type === 'tool_call_end') {
        // Parse the accumulated args
        try {
          const args = activeToolArgs ? JSON.parse(activeToolArgs) : {};
          const tc: LLMToolCall = { id: activeToolId, name: activeToolName, arguments: args };
          toolCalls.push(tc);
        } catch {
          this.logger.error('Failed to parse tool call arguments', { raw: activeToolArgs });
        }
        activeToolArgs = '';
      } else if (chunk.type === 'done') {
        if (chunk.stopReason === 'tool_use' && toolCalls.length > 0) {
          // Finalize TTS for any text emitted before the tool call
          if (fullText.trim() && !this._outputMuted) {
            if (isLiveTTS(tts)) {
              await this.finalizeLiveTTS(fullText);
            } else if (isRestTTS(tts)) {
              await this.processTTS(fullText);
            }
          }

          // Add assistant message with tool calls to history
          const assistantMsg: LLMMessage = { role: 'assistant', content: fullText, toolCalls };
          messages.push(assistantMsg);

          // Execute each tool and collect results
          for (const tc of toolCalls) {
            this.emitEvent({
              type: 'llm.chunk',
              chunk: '',
              accumulated: fullText,
              visual: '',
              spoken: '',
              timestamp: Date.now(),
            });
            const result = await toolConfig.onToolCall(tc);
            messages.push({ role: 'tool', content: result.content, toolCallId: result.toolCallId });
          }

          // Reset for the follow-up call
          fullText = '';
          toolCalls = [];

          // Re-call the LLM with tool results — it may produce text, more
          // tool calls, or a mix. We loop until the LLM stops calling tools
          // (up to a safety limit to prevent infinite loops).
          const MAX_TOOL_ROUNDS = 5;
          let round = 1;
          let continueLoop = true;

          while (continueLoop && round < MAX_TOOL_ROUNDS && !signal.aborted) {
            if (isLiveTTS(tts) && !this._outputMuted) {
              await tts.connect();
            }

            const followUp = await llm.generateWithTools(messages, {
              signal,
              tools: toolConfig.definitions,
            });

            continueLoop = false;

            for await (const chunk2 of followUp) {
              if (signal.aborted) break;
              if (chunk2.type === 'text') {
                fullText += chunk2.text;
                router.push(chunk2.text);
              } else if (chunk2.type === 'tool_call_start') {
                activeToolId = chunk2.toolCall.id;
                activeToolName = chunk2.toolCall.name;
                activeToolArgs = '';
              } else if (chunk2.type === 'tool_call_delta') {
                activeToolArgs += chunk2.argumentsDelta;
              } else if (chunk2.type === 'tool_call_end') {
                try {
                  const args = activeToolArgs ? JSON.parse(activeToolArgs) : {};
                  toolCalls.push({ id: activeToolId, name: activeToolName, arguments: args });
                } catch {
                  this.logger.error('Failed to parse tool call arguments', { raw: activeToolArgs });
                }
                activeToolArgs = '';
              } else if (chunk2.type === 'done') {
                if (chunk2.stopReason === 'tool_use' && toolCalls.length > 0) {
                  // Finalize any intermediate text
                  if (fullText.trim() && !this._outputMuted) {
                    if (isLiveTTS(tts)) {
                      await this.finalizeLiveTTS(fullText);
                    } else if (isRestTTS(tts)) {
                      await this.processTTS(fullText);
                    }
                  }

                  // Add assistant message + execute tools
                  messages.push({ role: 'assistant', content: fullText, toolCalls });
                  for (const tc of toolCalls) {
                    const result = await toolConfig.onToolCall(tc);
                    messages.push({ role: 'tool', content: result.content, toolCallId: result.toolCallId });
                  }

                  fullText = '';
                  toolCalls = [];
                  round++;
                  continueLoop = true;
                }
              }
            }
          }
        }
      }
    }

    return fullText;
  }

  /**
   * Mute audio input (microphone), pausing speech capture and STT processing.
   *
   * @remarks
   * The agent remains initialized and can still receive text input via
   * {@link sendMessage}. Call {@link unmuteInput} to resume voice capture.
   *
   * @example
   * ```typescript
   * agent.muteInput();
   * // User can still type via sendMessage()
   * await agent.sendMessage('Hello');
   * agent.unmuteInput(); // resume mic
   * ```
   */
  muteInput(): void {
    this.assertInitialized();
    this._inputMuted = true;

    const captureState = this.captureStateMachine.getState();
    if (captureState !== 'active') {
      this.logger.debug('muteInput() called but capture not active', { captureState });
      return;
    }

    this.captureStateMachine.setPaused();

    if (!this.isMultiRoleInput) {
      this.inputQueue.stopDraining();
      this.pipeline.input.pause();
    }
  }

  /**
   * Unmute audio input (microphone), resuming speech capture and STT processing.
   *
   * @see {@link muteInput}
   */
  async unmuteInput(): Promise<void> {
    this.assertInitialized();
    this._inputMuted = false;

    const captureState = this.captureStateMachine.getState();
    if (captureState !== 'paused') {
      this.logger.debug('unmuteInput() called but capture not paused', { captureState });
      return;
    }

    if (!this.isMultiRoleInput) {
      this.pipeline.input.resume();
    }

    // Reconnect STT if it's a live provider
    const { stt } = this;
    if (isLiveSTT(stt)) {
      await stt.connect();
      const header = this.headerCache.getHeader();
      if (header) stt.sendAudio(header);
      this.inputQueue.startDraining((chunk: { data: ArrayBuffer }) => stt.sendAudio(chunk.data));
    }

    this.captureStateMachine.setActive();
  }

  /**
   * Mute audio output (speaker), suppressing TTS playback.
   *
   * @remarks
   * LLM responses still stream and emit `llm.chunk` / `llm.complete` events,
   * but audio will not be played. This is useful when the user prefers to
   * read responses as text.
   *
   * @see {@link unmuteOutput}
   */
  muteOutput(): void {
    this.assertInitialized();
    this._outputMuted = true;
  }

  /**
   * Unmute audio output (speaker), resuming TTS playback for future responses.
   *
   * @see {@link muteOutput}
   */
  unmuteOutput(): void {
    this.assertInitialized();
    this._outputMuted = false;
  }

  /**
   * Whether audio output (TTS playback) is currently muted.
   */
  get isOutputMuted(): boolean {
    return this._outputMuted;
  }

  /**
   * Whether audio input (microphone) is currently muted.
   */
  get isInputMuted(): boolean {
    return this._inputMuted;
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
   * Returns statistics from both the input and output audio buffer queues.
   *
   * @remarks
   * Provides observability into the pipeline's buffering behavior. The input
   * queue sits between the `AudioInputProvider` and the STT provider; the
   * output queue sits between the TTS provider and the `AudioOutputProvider`.
   *
   * Stats include current size, total enqueued/dequeued/dropped counts, and
   * the age of the oldest buffered chunk. For multi-role providers where the
   * queue is not actively used, stats will show zero activity.
   *
   * @returns An object with `input` and `output` {@link QueueStats} snapshots.
   *
   * @example
   * ```typescript
   * const stats = agent.getQueueStats();
   * console.log(`Input queue: ${stats.input.size} buffered, ${stats.input.totalDropped} dropped`);
   * console.log(`Output queue: ${stats.output.size} buffered`);
   * ```
   */
  getQueueStats(): { input: QueueStats; output: QueueStats } {
    const inputStats = this.inputQueue.getStats();
    const outputStats = this.outputQueue.getStats();

    // Emit queue.stats events for both queues
    const timestamp = Date.now();
    this.events.emitSync({
      type: 'queue.stats',
      queueName: inputStats.name,
      size: inputStats.size,
      totalEnqueued: inputStats.totalEnqueued,
      totalDequeued: inputStats.totalDequeued,
      oldestChunkAge: inputStats.oldestChunkAge,
      timestamp,
    });
    this.events.emitSync({
      type: 'queue.stats',
      queueName: outputStats.name,
      size: outputStats.size,
      totalEnqueued: outputStats.totalEnqueued,
      totalDequeued: outputStats.totalDequeued,
      oldestChunkAge: outputStats.oldestChunkAge,
      timestamp,
    });

    return {
      input: inputStats,
      output: outputStats,
    };
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
   * Disposes of the SDK, releasing all resources including providers, queues,
   * state machines, event listeners, and conversation history.
   *
   * @remarks
   * This method performs a full teardown in the following order:
   *
   * 1. Stops listening and speaking if the agent is in those states.
   * 2. Aborts any in-flight eager LLM generation.
   * 3. Clears conversation history.
   * 4. Clears both input and output queues.
   * 5. Disposes all pipeline providers concurrently, deduplicated so that
   *    multi-role providers (e.g., NativeSTT covering `input`+`stt`) are
   *    only disposed once.
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

      // Clear queues
      this.inputQueue.clear();
      this.outputQueue.clear();

      // Dispose all unique providers (deduplicated for multi-role instances)
      const uniqueProviders = new Set<BaseProvider>([
        this.pipeline.input,
        this.pipeline.stt,
        this.pipeline.llm,
        this.pipeline.tts,
        this.pipeline.output,
      ]);
      await Promise.all([...uniqueProviders].map((p) => p.dispose()));

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
