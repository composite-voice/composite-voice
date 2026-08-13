/**
 * OpenAI real-time speech-to-text provider using the Realtime API
 * transcription intent over WebSocket.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Server VAD turn-detection configuration for OpenAI Realtime
 * transcription sessions.
 *
 * @remarks
 * Server VAD detects the start and end of speech based on audio volume
 * and commits the input buffer automatically at each turn boundary.
 *
 * @see {@link OpenAIRealtimeSTTConfig.turnDetection}
 */
export interface OpenAIRealtimeServerVad {
  /** Simple volume-based voice activity detection. */
  type: 'server_vad';
  /**
   * Activation threshold for VAD (0.0 to 1.0). Higher values require
   * louder audio and can perform better in noisy environments.
   * @default 0.5 (OpenAI server default)
   */
  threshold?: number;
  /**
   * Amount of audio (in milliseconds) to include before detected speech.
   * @default 300 (OpenAI server default)
   */
  prefixPaddingMs?: number;
  /**
   * Duration of silence (in milliseconds) that ends a turn. Shorter
   * values finalize utterances faster but may cut off slow speakers.
   * @default 500 (OpenAI server default)
   */
  silenceDurationMs?: number;
}

/**
 * Semantic VAD turn-detection configuration for OpenAI Realtime
 * transcription sessions.
 *
 * @remarks
 * Semantic VAD uses a turn-detection model (in conjunction with VAD) to
 * estimate whether the user has finished speaking, waiting longer when
 * the utterance sounds incomplete (e.g. trails off with "uhhm").
 *
 * @see {@link OpenAIRealtimeSTTConfig.turnDetection}
 */
export interface OpenAIRealtimeSemanticVad {
  /** Model-based semantic turn detection. */
  type: 'semantic_vad';
  /**
   * How eagerly to end the turn. `'low'` waits longer for the user to
   * continue; `'high'` chunks audio as soon as possible.
   * @default 'auto' (equivalent to 'medium')
   */
  eagerness?: 'low' | 'medium' | 'high' | 'auto';
}

/**
 * Turn-detection configuration for OpenAI Realtime transcription sessions.
 *
 * @see {@link OpenAIRealtimeServerVad}
 * @see {@link OpenAIRealtimeSemanticVad}
 */
export type OpenAIRealtimeTurnDetection = OpenAIRealtimeServerVad | OpenAIRealtimeSemanticVad;

/**
 * Configuration options for the {@link OpenAIRealtimeSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with OpenAI Realtime-specific settings.
 * You must provide **either** `apiKey` (for direct connections) or
 * `proxyUrl` (for a server-side proxy that injects the API key). If both
 * are provided, `proxyUrl` takes precedence.
 *
 * For direct browser connections, mint an ephemeral client secret
 * server-side (`POST /v1/realtime/client_secrets`) and pass an async
 * factory as `apiKey` so a fresh secret is fetched on each connection.
 *
 * @example
 * ```ts
 * // Direct connection with an ephemeral client-secret factory
 * const config: OpenAIRealtimeSTTConfig = {
 *   apiKey: async () => {
 *     const res = await fetch('/api/openai-client-secret');
 *     const { value } = await res.json();
 *     return value;
 *   },
 *   model: 'gpt-4o-mini-transcribe',
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: OpenAIRealtimeSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/openai-realtime',
 *   language: 'en',
 * };
 * ```
 *
 * @see {@link OpenAIRealtimeSTT} for the provider class
 */
export interface OpenAIRealtimeSTTConfig extends STTProviderConfig {
  /**
   * The transcription model to use.
   *
   * @remarks
   * Current options are `'gpt-4o-mini-transcribe'`, `'gpt-4o-transcribe'`,
   * `'whisper-1'`, and `'gpt-realtime-whisper'` (plus dated snapshots).
   *
   * `'gpt-realtime-whisper'` streams natively but does not support
   * server-side turn detection -- set {@link turnDetection} to `null`
   * and call {@link OpenAIRealtimeSTT.finalize} to commit audio manually.
   *
   * @default 'gpt-4o-mini-transcribe'
   */
  model?: string;
  /**
   * Input audio encoding for audio appended to the buffer.
   *
   * @remarks
   * - `'audio/pcm'` -- 16-bit PCM. Only a 24 kHz mono sample rate is
   *   supported (configure your input provider accordingly).
   * - `'audio/pcmu'` -- G.711 mu-law (8 kHz, telephony).
   * - `'audio/pcma'` -- G.711 A-law (8 kHz, telephony).
   *
   * @default 'audio/pcm'
   */
  inputAudioFormat?: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
  /**
   * Optional text to guide transcription style or spelling of domain
   * terms (e.g. `'Keywords: CompositeVoice, Deepgram, Soniox'`).
   *
   * @remarks
   * Not supported by `'gpt-realtime-whisper'`.
   */
  prompt?: string;
  /**
   * Latency/accuracy tradeoff for `'gpt-realtime-whisper'`.
   *
   * @remarks
   * Lower settings emit partial text earlier; higher settings give the
   * model more audio context and can improve word error rate.
   */
  transcriptionDelay?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /**
   * Voice activity detection used to commit audio at turn boundaries.
   *
   * @remarks
   * Defaults to server VAD, which drives `utteranceComplete` results for
   * automatic turn-taking in the CompositeVoice pipeline. Set to `null`
   * to disable VAD and commit audio manually via
   * {@link OpenAIRealtimeSTT.finalize} (required for
   * `'gpt-realtime-whisper'`, which does not support VAD).
   *
   * @default \{ type: 'server_vad' \}
   */
  turnDetection?: OpenAIRealtimeTurnDetection | null;
  /**
   * Noise reduction applied to input audio before VAD and transcription.
   *
   * @remarks
   * Use `'near_field'` for close-talking microphones such as headphones,
   * or `'far_field'` for laptop or conference-room microphones.
   *
   * @default undefined (noise reduction off)
   */
  noiseReduction?: 'near_field' | 'far_field';
  /**
   * OpenAI organization ID, sent as an auth subprotocol in direct mode.
   * @default undefined
   */
  organizationId?: string;
  /**
   * OpenAI project ID, sent as an auth subprotocol in direct mode.
   * @default undefined
   */
  projectId?: string;
}

/**
 * A server event from the OpenAI Realtime WebSocket.
 * @internal
 */
interface OpenAIRealtimeEvent {
  type?: string;
  event_id?: string;
  item_id?: string;
  content_index?: number;
  delta?: string;
  transcript?: string;
  audio_start_ms?: number;
  audio_end_ms?: number;
  previous_item_id?: string;
  usage?: Record<string, unknown>;
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
  };
}

/** @internal Default OpenAI Realtime WebSocket base URL (host only). */
const OPENAI_REALTIME_WS_URL = 'wss://api.openai.com';

/** @internal Realtime API path and transcription intent query string. */
const REALTIME_PATH = '/v1/realtime?intent=transcription';

/**
 * OpenAI real-time STT provider using the Realtime API transcription
 * intent over a raw WebSocket connection.
 *
 * @remarks
 * `OpenAIRealtimeSTT` extends {@link LiveSTTProvider} and connects to
 * `wss://api.openai.com/v1/realtime?intent=transcription`. After the
 * connection opens, a `session.update` event configures a
 * transcription-only session (`session.type: 'transcription'`), then
 * audio is streamed as base64-encoded `input_audio_buffer.append`
 * events.
 *
 * Incremental transcript text arrives as
 * `conversation.item.input_audio_transcription.delta` events -- the
 * provider accumulates deltas per input item and emits interim results.
 * When server VAD detects a turn boundary it commits the audio buffer,
 * and the finished transcript arrives as a
 * `conversation.item.input_audio_transcription.completed` event -- the
 * provider then emits the utterance with `isFinal: true` and
 * `utteranceComplete: true`, triggering the next pipeline stage.
 *
 * Key features:
 *
 * - Interim (delta) and final (completed) transcription results
 * - Server VAD or semantic VAD turn detection for automatic turn-taking
 * - Optional input noise reduction and prompt-based vocabulary steering
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager})
 * - Proxy mode via {@link OpenAIRealtimeSTTConfig.proxyUrl} (recommended
 *   for production so the API key stays server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Authentication:** browsers cannot set WebSocket headers, so direct
 * mode authenticates with OpenAI's documented WebSocket subprotocols
 * (`'realtime'` + `'openai-insecure-api-key.<KEY>'`). Pass an async
 * `apiKey` factory returning an ephemeral client secret (minted
 * server-side via `POST /v1/realtime/client_secrets`) to avoid exposing
 * a standard API key. In proxy mode the proxy injects an
 * `Authorization: Bearer` header upstream instead.
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required -- the provider uses a raw WebSocket
 * connection managed by the SDK's built-in {@link WebSocketManager}.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> input_audio_buffer.append -> OpenAI WS
 *                                                                                   |
 * CompositeVoice <- onTranscription(result) <--- delta/completed events <-----------+
 * ```
 *
 * @example
 * ```ts
 * import { OpenAIRealtimeSTT } from 'composite-voice';
 *
 * const stt = new OpenAIRealtimeSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/openai-realtime',
 *   model: 'gpt-4o-mini-transcribe',
 *   language: 'en',
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   if (result.isFinal) {
 *     console.log('Final:', result.text);
 *   } else {
 *     console.log('Interim:', result.text);
 *   }
 * });
 *
 * await stt.connect();
 * // ... send 24kHz mono PCM chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link OpenAIRealtimeSTTConfig} for configuration options
 * @see {@link SonioxSTT} for an alternative real-time STT provider
 */
export class OpenAIRealtimeSTT extends LiveSTTProvider {
  declare public config: OpenAIRealtimeSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** Accumulated delta text per input item (keyed by `item_id`). */
  private itemTranscripts = new Map<string, string>();

  /**
   * Create a new OpenAIRealtimeSTT provider.
   *
   * @param config - OpenAI Realtime STT configuration. Must include
   *   either `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new OpenAIRealtimeSTT({
   *   apiKey: 'sk-...',
   *   model: 'gpt-4o-transcribe',
   * });
   * ```
   */
  constructor(config: OpenAIRealtimeSTTConfig, logger?: Logger) {
    const finalConfig: OpenAIRealtimeSTTConfig = {
      model: 'gpt-4o-mini-transcribe',
      inputAudioFormat: 'audio/pcm',
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate that either `apiKey` or `proxyUrl` is configured.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is set.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'OpenAIRealtimeSTT',
        new Error('OpenAIRealtimeSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    this.logger.info('OpenAI Realtime STT initialized', {
      model: this.config.model,
      inputAudioFormat: this.config.inputAudioFormat,
      turnDetection: this.config.turnDetection === null ? 'manual' : 'vad',
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /** Disconnect the WebSocket (if connected) and release the manager. */
  protected async onDispose(): Promise<void> {
    if (this.wsManager) {
      try {
        await this.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting during dispose', error as Error);
      }
    }
    this.wsManager = null;
    this.logger.info('OpenAI Realtime STT disposed');
  }

  /**
   * Build the WebSocket URL for the Realtime transcription intent.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v1/realtime?intent=transcription`
   * Direct mode: `wss://api.openai.com/v1/realtime?intent=transcription`
   *
   * Authentication happens via WebSocket subprotocols (direct mode) or a
   * proxy-injected `Authorization: Bearer` header, not the URL.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    const base = this.config.proxyUrl
      ? this.config.proxyUrl.replace(/^http/, 'ws')
      : OPENAI_REALTIME_WS_URL;

    return `${base}${REALTIME_PATH}`;
  }

  /**
   * Resolve the WebSocket subprotocols used for direct-mode auth.
   *
   * @remarks
   * OpenAI documents browser WebSocket authentication via subprotocols:
   * `'realtime'` plus `'openai-insecure-api-key.<KEY>'` (and optionally
   * `'openai-organization.<ORG>'` / `'openai-project.<PROJECT>'`). The
   * key slot accepts either a standard API key or an ephemeral client
   * secret minted server-side -- pass an async `apiKey` factory for the
   * ephemeral flow. Returns `undefined` in proxy mode, where the proxy
   * injects an `Authorization: Bearer` header instead.
   */
  private async buildProtocols(): Promise<string[] | undefined> {
    if (this.isProxyMode) return undefined;

    const apiKey = await this.resolveApiKey();
    const protocols = ['realtime', `openai-insecure-api-key.${apiKey}`];

    if (this.config.organizationId) {
      protocols.push(`openai-organization.${this.config.organizationId}`);
    }
    if (this.config.projectId) {
      protocols.push(`openai-project.${this.config.projectId}`);
    }

    return protocols;
  }

  /**
   * Build the `session.update` event that configures the transcription
   * session.
   *
   * @remarks
   * Sets `session.type: 'transcription'` and the input audio settings:
   * format, transcription model/prompt/language, turn detection, and
   * noise reduction. Turn detection defaults to server VAD so the
   * session commits audio automatically at turn boundaries; an explicit
   * `null` disables VAD for manual commits via {@link finalize}.
   */
  private buildSessionUpdate(): Record<string, unknown> {
    const format: Record<string, unknown> = {
      type: this.config.inputAudioFormat ?? 'audio/pcm',
    };
    if (format.type === 'audio/pcm') {
      // Only a 24 kHz sample rate is supported for raw PCM.
      format.rate = 24000;
    }

    const transcription: Record<string, unknown> = {
      model: this.config.model ?? 'gpt-4o-mini-transcribe',
    };
    if (this.config.language) {
      transcription.language = this.config.language;
    }
    if (this.config.prompt) {
      transcription.prompt = this.config.prompt;
    }
    if (this.config.transcriptionDelay) {
      transcription.delay = this.config.transcriptionDelay;
    }

    const input: Record<string, unknown> = {
      format,
      transcription,
      turn_detection: this.buildTurnDetection(),
    };

    if (this.config.noiseReduction) {
      input.noise_reduction = { type: this.config.noiseReduction };
    }

    return {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: { input },
      },
    };
  }

  /**
   * Map the camelCase turn-detection config to the wire format.
   *
   * @remarks
   * Defaults to `{ type: 'server_vad' }` when unset; an explicit `null`
   * is passed through to disable VAD.
   */
  private buildTurnDetection(): Record<string, unknown> | null {
    const turnDetection =
      this.config.turnDetection === undefined
        ? { type: 'server_vad' as const }
        : this.config.turnDetection;

    if (turnDetection === null) return null;

    if (turnDetection.type === 'semantic_vad') {
      const wire: Record<string, unknown> = { type: 'semantic_vad' };
      if (turnDetection.eagerness) {
        wire.eagerness = turnDetection.eagerness;
      }
      return wire;
    }

    const wire: Record<string, unknown> = { type: 'server_vad' };
    if (turnDetection.threshold != null) {
      wire.threshold = turnDetection.threshold;
    }
    if (turnDetection.prefixPaddingMs != null) {
      wire.prefix_padding_ms = turnDetection.prefixPaddingMs;
    }
    if (turnDetection.silenceDurationMs != null) {
      wire.silence_duration_ms = turnDetection.silenceDurationMs;
    }
    return wire;
  }

  /**
   * Open a WebSocket connection to OpenAI for real-time transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection disabled — a dead
   * socket must surface immediately via onConnectionLost so the SDK (or a
   * FallbackSTT chain) can recover. The SDK drives reconnection through
   * {@link connect}. Waits for the connection to open, then sends the
   * `session.update` event that configures the transcription session.
   * Each call to {@link connect} re-sends the session configuration.
   * The connection timeout defaults to
   * {@link OpenAIRealtimeSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to OpenAI Realtime STT');
      return;
    }

    try {
      this.logger.debug('Connecting to OpenAI Realtime STT WebSocket');

      const wsUrl = this.buildWebSocketUrl();
      const protocols = await this.buildProtocols();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        protocols,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: silent background retries drop every
        // audio chunk for the length of the backoff, so a dead socket must
        // surface immediately via onConnectionLost instead. The SDK drives
        // reconnection through connect() (and FallbackSTT owns failover),
        // and connect() re-sends the session configuration each time.
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Set up message handlers
      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('OpenAI Realtime STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('OpenAI Realtime STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`OpenAI Realtime STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();

      // Configure the transcription session
      this.wsManager.send(JSON.stringify(this.buildSessionUpdate()));

      this.isConnected = true;
      this.itemTranscripts.clear();

      this.logger.info('Connected to OpenAI Realtime STT WebSocket', {
        model: this.config.model,
        inputAudioFormat: this.config.inputAudioFormat,
      });
    } catch (error) {
      // Close any half-open socket (e.g. connected but the session.update
      // failed to send) before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('OpenAIRealtimeSTT', error as Error);
    }
  }

  /**
   * Parse and dispatch incoming server events from OpenAI.
   *
   * @remarks
   * `conversation.item.input_audio_transcription.delta` events are
   * accumulated per item and emitted as interim results. When the
   * VAD-detected turn completes, the
   * `conversation.item.input_audio_transcription.completed` event is
   * emitted with `isFinal: true` and `utteranceComplete: true` via
   * {@link emitTranscription}. `error` and `...transcription.failed`
   * events produce empty error results carrying the failure metadata.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from OpenAI Realtime, ignoring');
        return;
      }

      const message: OpenAIRealtimeEvent = JSON.parse(event.data);

      switch (message.type) {
        case 'conversation.item.input_audio_transcription.delta':
          this.handleDelta(message);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          this.handleCompleted(message);
          break;

        case 'conversation.item.input_audio_transcription.failed':
        case 'error':
          this.handleError(message);
          break;

        case 'input_audio_buffer.speech_started':
          this.logger.debug('Speech started', { audioStartMs: message.audio_start_ms });
          break;

        case 'input_audio_buffer.speech_stopped':
          this.logger.debug('Speech stopped', { audioEndMs: message.audio_end_ms });
          break;

        case 'input_audio_buffer.committed':
          this.logger.debug('Audio buffer committed', { itemId: message.item_id });
          break;

        default:
          this.logger.debug('Unhandled OpenAI Realtime event', { type: message.type });
          break;
      }
    } catch (error) {
      this.logger.error('Error processing OpenAI Realtime WebSocket message', error);
    }
  }

  /** Accumulate a transcript delta and emit an interim result. @internal */
  private handleDelta(message: OpenAIRealtimeEvent): void {
    const itemId = message.item_id ?? '';
    const text = (this.itemTranscripts.get(itemId) ?? '') + (message.delta ?? '');
    this.itemTranscripts.set(itemId, text);

    if (this.config.interimResults !== false && text.trim()) {
      this.emitTranscription({
        text: text.trim(),
        isFinal: false,
        metadata: {
          itemId,
        },
      });
    }
  }

  /** Emit the completed transcript as a final utterance. @internal */
  private handleCompleted(message: OpenAIRealtimeEvent): void {
    const itemId = message.item_id ?? '';
    const text = (message.transcript ?? this.itemTranscripts.get(itemId) ?? '').trim();
    this.itemTranscripts.delete(itemId);

    if (!text) return;

    this.emitTranscription({
      text,
      isFinal: true,
      speechFinal: true,
      utteranceComplete: true,
      metadata: {
        itemId,
        ...(message.usage ? { usage: message.usage } : {}),
      },
    });
  }

  /** Emit an error result for `error` / transcription-failed events. @internal */
  private handleError(message: OpenAIRealtimeEvent): void {
    this.logger.error('OpenAI Realtime error', {
      eventType: message.type,
      errorType: message.error?.type,
      errorCode: message.error?.code,
      errorMessage: message.error?.message,
    });

    if (message.item_id) {
      this.itemTranscripts.delete(message.item_id);
    }

    this.emitTranscription({
      text: '',
      isFinal: true,
      confidence: 0,
      metadata: {
        error: message.error?.message,
        errorCode: message.error?.code,
        errorType: message.error?.type,
      },
    });
  }

  /**
   * Send a raw audio chunk to OpenAI for real-time transcription.
   *
   * @remarks
   * The Realtime API accepts audio as base64 payloads inside
   * `input_audio_buffer.append` JSON events, so the `ArrayBuffer` is
   * base64-encoded before sending. If the connection is not open, the
   * chunk is silently dropped and a warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.wsManager.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: this.encodeBase64(chunk),
        })
      );
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /** Encode an `ArrayBuffer` as a base64 string. @internal */
  private encodeBase64(chunk: ArrayBuffer): string {
    const bytes = new Uint8Array(chunk);
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      parts.push(String.fromCharCode(bytes[i] as number));
    }
    return btoa(parts.join(''));
  }

  /**
   * Commit the input audio buffer, forcing transcription to begin.
   *
   * @remarks
   * Sends an `input_audio_buffer.commit` event. Required for manual
   * turn-taking when {@link OpenAIRealtimeSTTConfig.turnDetection} is
   * `null` (e.g. with `'gpt-realtime-whisper'`); with server VAD the
   * session commits audio automatically at turn boundaries.
   */
  finalize(): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.wsManager.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    } catch (error) {
      this.logger.error('Failed to send commit message', error);
    }
  }

  /**
   * Gracefully close the OpenAI Realtime WebSocket connection.
   *
   * @remarks
   * The Realtime API has no end-of-stream handshake -- pending audio
   * that has not been committed is discarded. Call {@link finalize}
   * first if manual commits are in use and audio is still buffered.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to OpenAI Realtime STT');
      return;
    }

    if (!this.isConnected) {
      // The session is already dead, but the manager (and possibly a live
      // socket) may still exist — tear it down for real so nothing leaks.
      const manager = this.wsManager;
      this.wsManager = null;
      await manager.disconnect();
      return;
    }

    try {
      this.logger.debug('Disconnecting from OpenAI Realtime STT WebSocket');

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;
      this.itemTranscripts.clear();

      this.logger.info('Disconnected from OpenAI Realtime STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from OpenAI Realtime STT', error);
      throw error;
    }
  }

  /**
   * Check whether the OpenAI Realtime WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
