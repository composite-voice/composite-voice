/**
 * Deepgram Flux (STT V2) real-time speech-to-text provider using native WebSocket.
 *
 * @remarks
 * Connects directly to the Deepgram V2 WebSocket API (`/v2/listen`) without the
 * `@deepgram/sdk`. The V2 pipeline delivers structured `TurnInfo` events
 * (`StartOfTurn`, `Update`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`) that
 * map naturally to the CompositeVoice eager-LLM pipeline.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderConnectionError } from '../../../utils/errors';
import { buildQueryParams } from '../../../utils/queryParams';

/**
 * Deepgram Flux transcription options passed as query parameters
 * on the V2 WebSocket connection URL.
 *
 * @see {@link DeepgramFluxConfig} for the full provider configuration
 */
export interface DeepgramFluxOptions {
  /** Flux model to use. Currently only `'flux-general-en'`. */
  model?: string;

  /**
   * Audio encoding format.
   * Required when sending non-containerized/raw audio.
   */
  encoding?: string;

  /** Sample rate in Hz. Required when `encoding` is set. */
  sampleRate?: number;

  /**
   * End-of-turn confidence threshold (0.5–0.9).
   * Controls when `EndOfTurn` fires.
   * @defaultValue `0.7`
   */
  eotThreshold?: number;

  /**
   * Eager end-of-turn confidence threshold (0.3–0.9).
   * When set, enables `EagerEndOfTurn` and `TurnResumed` events.
   * This is what powers the eager LLM pipeline.
   */
  eagerEotThreshold?: number;

  /**
   * Milliseconds after speech before forcing an end-of-turn,
   * regardless of EOT confidence.
   * @defaultValue `5000`
   */
  eotTimeoutMs?: number;

  /** Keyterms to boost recognition of specialized terminology. */
  keyterms?: string | string[];

  /** Labels for usage reporting. Multiple values are sent as separate `tag=` query parameters. */
  tag?: string | string[];

  /** Opt out of the Deepgram Model Improvement Program. */
  mipOptOut?: boolean;
}

/**
 * Configuration options for the {@link DeepgramFlux} provider.
 */
export interface DeepgramFluxConfig extends STTProviderConfig {
  apiKey?: string;
  proxyUrl?: string;
  options?: DeepgramFluxOptions;
}

/** Deepgram's base WebSocket URL for streaming transcription. */
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com';

/**
 * A V2 `TurnInfo` message from the Deepgram Flux API.
 */
interface TurnInfoMessage {
  type: 'TurnInfo';
  request_id: string;
  sequence_id: number;
  event: 'StartOfTurn' | 'Update' | 'EagerEndOfTurn' | 'TurnResumed' | 'EndOfTurn';
  turn_index: number;
  audio_window_start: number;
  audio_window_end: number;
  transcript: string;
  words: { word: string; confidence: number }[];
  end_of_turn_confidence: number;
}

/**
 * Deepgram Flux (V2) real-time STT provider using native WebSocket.
 *
 * @remarks
 * `DeepgramFlux` extends {@link LiveSTTProvider} and connects to Deepgram's
 * V2 WebSocket streaming transcription API directly. It supports:
 *
 * - Turn-based transcription via `TurnInfo` events
 * - Eager end-of-turn signals (`EagerEndOfTurn` → `isPreflight: true`)
 * - Configurable end-of-turn confidence thresholds
 * - Keyterm boosting for domain vocabulary
 * - Keep-alive and finalize (flush) methods
 *
 * **Transport:** Native WebSocket (no `@deepgram/sdk` required)
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 *
 * **Only STT provider that supports the eager LLM pipeline.**
 *
 * @example
 * ```ts
 * import { DeepgramFlux, MicrophoneInput, BrowserAudioOutput } from 'composite-voice';
 *
 * const stt = new DeepgramFlux({
 *   proxyUrl: '/api/proxy/deepgram',
 *   options: {
 *     model: 'flux-general-en',
 *     eagerEotThreshold: 0.5,
 *     eotThreshold: 0.7,
 *   },
 * });
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link DeepgramFluxConfig} for configuration options
 */
export class DeepgramFlux extends LiveSTTProvider {
  declare public config: DeepgramFluxConfig;

  /** The raw WebSocket connection to Deepgram. */
  private ws: WebSocket | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Create a new DeepgramFlux provider.
   *
   * @param config - Deepgram Flux configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: DeepgramFluxConfig, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate configuration — no SDK import required.
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    if (this.isProxyMode) {
      this.logger.info('Deepgram Flux initialized (proxy mode)', {
        proxyUrl: this.config.proxyUrl,
      });
    } else {
      this.logger.info('Deepgram Flux initialized (direct mode)', {
        model: this.config.options?.model ?? 'flux-general-en',
      });
    }
  }

  /** Disconnect the WebSocket (if connected) and release resources. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.ws = null;
    this.logger.info('Deepgram Flux disposed');
  }

  /**
   * Build the full WebSocket connection URL with query parameters.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v2/listen?model=flux-general-en&...`
   * Direct mode: `wss://api.deepgram.com/v2/listen?model=flux-general-en&...`
   */
  private buildConnectionUrl(): string {
    const base = this.resolveBaseUrl(DEEPGRAM_WS_URL);
    if (!base) {
      throw new ProviderConnectionError(
        'DeepgramFlux',
        new Error('Failed to resolve base WebSocket URL')
      );
    }
    const opts = this.config.options;

    const params = buildQueryParams(
      {
        model: opts?.model ?? 'flux-general-en',
        encoding: opts?.encoding,
        sampleRate: opts?.sampleRate,
        eotThreshold: opts?.eotThreshold,
        eagerEotThreshold: opts?.eagerEotThreshold,
        eotTimeoutMs: opts?.eotTimeoutMs,
        keyterms: opts?.keyterms,
        tag: opts?.tag,
        mipOptOut: opts?.mipOptOut,
      },
      {
        keyterms: 'keyterm',
      }
    );

    return `${base}/v2/listen?${params.toString()}`;
  }

  /**
   * Open a WebSocket connection to Deepgram for real-time V2 transcription.
   *
   * @remarks
   * The handshake flow is:
   *
   * 1. Build the connection URL with query parameters (model, thresholds, etc.)
   * 2. Resolve WebSocket sub-protocols (`token` for API-key authentication)
   * 3. Open the WebSocket and wait for the `onopen` event (with a configurable
   *    timeout, defaulting to 10 seconds)
   * 4. On success, register message/error/close event handlers via
   *    {@link setupEventHandlers}
   *
   * If the connection is already open, the call is a no-op with a warning log.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, or the connection times out / errors.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram Flux');
      return;
    }

    try {
      this.logger.debug('Connecting to Deepgram Flux WebSocket');

      const url = this.buildConnectionUrl();

      const protocols = this.resolveWsProtocols('token');
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

      // Wait for the connection to open (with timeout)
      const timeoutMs = this.config.timeout ?? 10000;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, timeoutMs);

        const ws = this.ws;
        if (!ws) {
          clearTimeout(timeout);
          reject(new Error('WebSocket instance was not created'));
          return;
        }

        ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram Flux WebSocket');
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          reject(
            new Error(`WebSocket error: ${(event as ErrorEvent).message ?? 'connection failed'}`)
          );
        };
      });

      // Register event handlers after connection is open
      this.setupEventHandlers();
    } catch (error) {
      this.ws = null;
      throw new ProviderConnectionError('DeepgramFlux', error as Error);
    }
  }

  /**
   * Wire up WebSocket message handlers for Deepgram V2 events:
   * `Connected`, `TurnInfo`, `Error`.
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'Connected':
              this.logger.debug('V2 Connected', { request_id: msg.request_id });
              break;
            case 'TurnInfo':
              this.handleTurnInfo(msg as TurnInfoMessage);
              break;
            case 'Error':
              this.logger.error('Deepgram Flux error', {
                code: msg.code,
                description: msg.description,
              });
              this.emitTranscription({
                text: '',
                isFinal: true,
                confidence: 0,
                metadata: { error: msg.description, code: msg.code },
              });
              break;
            default:
              this.logger.debug('Unknown V2 message type', msg);
          }
        } catch (error) {
          this.logger.error('Error parsing Deepgram Flux message', error);
        }
      }
    };

    this.ws.onerror = (event) => {
      this.logger.error('Deepgram Flux WebSocket error', event);

      this.emitTranscription({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: { error: (event as ErrorEvent).message ?? 'WebSocket error' },
      });
    };

    this.ws.onclose = (event) => {
      this.logger.info('Deepgram Flux WebSocket closed', {
        code: event.code,
        reason: event.reason,
      });
      this.isConnected = false;
    };
  }

  /**
   * Process a V2 `TurnInfo` message from Deepgram Flux.
   *
   * Maps V2 turn events to CompositeVoice transcription results:
   *
   * - `StartOfTurn` → interim (speech detected)
   * - `Update` → interim (partial transcript)
   * - `EagerEndOfTurn` → preflight (speculative LLM trigger)
   * - `TurnResumed` → interim (preflight cancelled, speech continues)
   * - `EndOfTurn` → final + utteranceComplete (committed result)
   */
  private handleTurnInfo(msg: TurnInfoMessage): void {
    const transcript = msg.transcript;
    const confidence =
      msg.words.length > 0
        ? msg.words.reduce((sum, w) => sum + w.confidence, 0) / msg.words.length
        : 0;

    switch (msg.event) {
      case 'StartOfTurn':
        this.logger.debug('V2 StartOfTurn', { turn_index: msg.turn_index });
        this.emitTranscription({
          text: '',
          isFinal: false,
          confidence: 1,
          metadata: { event: 'StartOfTurn', turn_index: msg.turn_index },
        });
        break;

      case 'Update':
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: false,
            confidence,
            metadata: {
              event: 'Update',
              turn_index: msg.turn_index,
              end_of_turn_confidence: msg.end_of_turn_confidence,
            },
          });
        }
        break;

      case 'EagerEndOfTurn':
        this.logger.debug('V2 EagerEndOfTurn', {
          turn_index: msg.turn_index,
          eot_confidence: msg.end_of_turn_confidence,
          transcript,
        });
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: false,
            isPreflight: true,
            confidence,
            metadata: {
              event: 'EagerEndOfTurn',
              turn_index: msg.turn_index,
              end_of_turn_confidence: msg.end_of_turn_confidence,
            },
          });
        }
        break;

      case 'TurnResumed':
        this.logger.debug('V2 TurnResumed', { turn_index: msg.turn_index });
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: false,
            confidence,
            metadata: {
              event: 'TurnResumed',
              turn_index: msg.turn_index,
              end_of_turn_confidence: msg.end_of_turn_confidence,
            },
          });
        }
        break;

      case 'EndOfTurn':
        this.logger.debug('V2 EndOfTurn', {
          turn_index: msg.turn_index,
          transcript,
        });
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: true,
            speechFinal: true,
            utteranceComplete: true,
            confidence,
            metadata: {
              event: 'EndOfTurn',
              turn_index: msg.turn_index,
              end_of_turn_confidence: msg.end_of_turn_confidence,
            },
          });
        }
        break;

      default:
        this.logger.debug('Unknown TurnInfo event', msg);
    }
  }

  /**
   * Send a raw audio chunk to Deepgram for real-time V2 transcription.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.ws.send(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Send a keep-alive signal to prevent the WebSocket from timing out.
   *
   * @remarks
   * Sends a `{ type: "KeepAlive" }` JSON message over the WebSocket.
   * Call this periodically during silence to keep the connection alive
   * when no audio is being streamed. If the WebSocket is not connected,
   * the call is a no-op with a warning log.
   */
  sendKeepAlive(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send keep-alive: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      this.logger.debug('Sent keep-alive');
    } catch (error) {
      this.logger.error('Failed to send keep-alive', error);
    }
  }

  /**
   * Send a finalize signal to flush any pending audio and force a final
   * transcription result.
   *
   * @remarks
   * Sends a `{ type: "Finalize" }` JSON message over the WebSocket.
   * This tells Deepgram to process any buffered audio immediately and
   * emit an `EndOfTurn` event, rather than waiting for the normal
   * end-of-turn confidence threshold. Useful when the application knows
   * the user has finished speaking (e.g., a push-to-talk release).
   * If the WebSocket is not connected, the call is a no-op with a warning log.
   */
  sendFinalize(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send finalize: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'Finalize' }));
      this.logger.debug('Sent finalize');
    } catch (error) {
      this.logger.error('Failed to send finalize', error);
    }
  }

  /**
   * Gracefully close the Deepgram Flux WebSocket connection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Not connected to Deepgram Flux');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram Flux WebSocket');

      // Send CloseStream for graceful server-side cleanup
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      } catch {
        // Ignore — connection may already be closing
      }

      // Wait for close event with a 1s safety timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.ws?.close();
          resolve();
        }, 1000);

        const ws = this.ws;
        if (ws) {
          const existingOnClose = ws.onclose;
          ws.onclose = (event) => {
            clearTimeout(timeout);
            if (existingOnClose) {
              existingOnClose.call(ws, event);
            }
            resolve();
          };
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.isConnected = false;
      this.ws = null;

      this.logger.info('Disconnected from Deepgram Flux WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram Flux', error);
      throw error;
    }
  }

  /**
   * Check whether the Deepgram Flux WebSocket connection is currently open.
   *
   * @returns `true` when the WebSocket is connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
