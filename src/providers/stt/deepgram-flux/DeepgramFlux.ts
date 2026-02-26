/**
 * Deepgram Flux (STT V2) real-time speech-to-text provider using the official
 * Deepgram JS SDK V5 `listen.v2` API.
 *
 * @remarks
 * Unlike the V1 (`listen.live`) API used by {@link DeepgramSTT}, the V2 pipeline
 * delivers structured `TurnInfo` events (`StartOfTurn`, `Update`,
 * `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`) that map naturally to the
 * CompositeVoice eager-LLM pipeline.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * V2 `TurnInfo` event names emitted by the Deepgram Flux model.
 *
 * @see {@link https://developers.deepgram.com/docs/stt-streaming-v2 | Deepgram STT V2 docs}
 */
type TurnInfoEvent = 'StartOfTurn' | 'Update' | 'EagerEndOfTurn' | 'TurnResumed' | 'EndOfTurn';

/**
 * Shape of a single word entry in a `TurnInfo` message.
 */
interface TurnInfoWord {
  word: string;
  confidence: number;
}

/**
 * Shape of a `ListenV2TurnInfo` message received over the V2 WebSocket.
 *
 * @remarks
 * This is a subset of the full SDK type, typed locally so consumers do not need
 * the `@deepgram/sdk` peer dependency installed at build time.
 */
interface ListenV2TurnInfo {
  type: 'TurnInfo';
  request_id: string;
  sequence_id: number;
  event: TurnInfoEvent;
  turn_index: number;
  audio_window_start: number;
  audio_window_end: number;
  transcript: string;
  words: TurnInfoWord[];
  end_of_turn_confidence: number;
}

/**
 * Shape of a `ListenV2Connected` message received when the V2 socket opens.
 */
interface ListenV2Connected {
  type: 'Connected';
  request_id: string;
}

/**
 * Shape of a `ListenV2FatalError` message received over the V2 WebSocket.
 */
interface ListenV2FatalError {
  type: 'FatalError';
  request_id: string;
  error: string;
  description: string;
}

/**
 * Union of all message types that can arrive via the V2 `message` event.
 */
type ListenV2Message = ListenV2Connected | ListenV2TurnInfo | ListenV2FatalError;

/**
 * Deepgram Flux transcription options passed to the V2 WebSocket connection.
 *
 * @remarks
 * These options map to Deepgram's
 * {@link https://developers.deepgram.com/docs/stt-streaming-v2 | STT V2 API}
 * parameters. They are set on the {@link DeepgramFluxConfig.options} property
 * and forwarded when the WebSocket connection is established.
 *
 * @see {@link DeepgramFluxConfig} for the full provider configuration
 */
export interface DeepgramFluxOptions {
  /**
   * Flux model to use for transcription.
   *
   * @defaultValue `'flux-general-en'`
   */
  model?: string;

  /**
   * Audio encoding format.
   *
   * Supported values: `'linear16'`, `'linear32'`, `'mulaw'`, `'alaw'`,
   * `'opus'`, `'ogg-opus'`.
   */
  encoding?: string;

  /**
   * Sample rate for audio data in Hz.
   *
   * Required when {@link encoding} is set.
   */
  sampleRate?: number;

  /**
   * End-of-turn confidence threshold (0.5-0.9).
   *
   * Confidence level required to confirm that the speaker has finished
   * their turn. Higher values require more certainty.
   *
   * @defaultValue `0.7`
   */
  eotThreshold?: number;

  /**
   * Eager end-of-turn confidence threshold (0.3-0.9).
   *
   * Confidence level at which an `EagerEndOfTurn` signal is emitted,
   * allowing the LLM to start generating speculatively.
   *
   * Setting this enables the eager/preflight pipeline. A lower value
   * triggers earlier but with more risk of false positives.
   */
  eagerEotThreshold?: number;

  /**
   * Maximum milliseconds before forcing end-of-turn regardless of
   * confidence.
   *
   * @defaultValue `5000`
   */
  eotTimeoutMs?: number;

  /**
   * Specialized terminology to boost recognition.
   *
   * Unlike keywords, keyterms use a more advanced boosting algorithm.
   *
   * @example `['CompositeVoice', 'WebSocket']`
   */
  keyterms?: string[];

  /** Label for usage reporting in the Deepgram console. */
  tag?: string;

  /** Opt out of the Deepgram Model Improvement Program. */
  mipOptOut?: boolean;
}

/**
 * Configuration options for the {@link DeepgramFlux} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Deepgram Flux-specific settings. You
 * must provide **either** `apiKey` (for direct browser-to-Deepgram connections)
 * or `proxyUrl` (for a server-side proxy that injects the API key). If both are
 * provided, `proxyUrl` takes precedence.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: DeepgramFluxConfig = {
 *   apiKey: 'dg_abc123...',
 *   options: { model: 'flux-general-en' },
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: DeepgramFluxConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   options: {
 *     model: 'flux-general-en',
 *     eagerEotThreshold: 0.5,
 *   },
 * };
 * ```
 *
 * @see {@link DeepgramFluxOptions} for transcription-specific settings
 * @see {@link DeepgramFlux} for the provider class
 */
export interface DeepgramFluxConfig extends STTProviderConfig {
  /**
   * Deepgram API key.
   * Required when connecting directly to Deepgram.
   * Omit when using `proxyUrl` -- the proxy server supplies the key.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's Deepgram endpoint.
   * Example: `'http://localhost:3000/api/proxy/deepgram'`
   *
   * When set, the Deepgram SDK connects to this URL instead of
   * `wss://api.deepgram.com`, allowing browsers to reach Deepgram through a
   * same-origin proxy that injects the real API key server-side.
   */
  proxyUrl?: string;

  /** Deepgram Flux transcription options. */
  options?: DeepgramFluxOptions;
}

/**
 * Deepgram Flux (V2) real-time STT provider using the official `@deepgram/sdk` V5.
 *
 * @remarks
 * `DeepgramFlux` extends {@link LiveSTTProvider} and connects to Deepgram's
 * V2 WebSocket-based streaming transcription API. It supports:
 *
 * - Turn-based transcription via `TurnInfo` events
 * - Eager end-of-turn signals for speculative LLM generation
 *   (`EagerEndOfTurn` -> `isPreflight: true`)
 * - Turn lifecycle tracking (`StartOfTurn`, `Update`, `TurnResumed`,
 *   `EndOfTurn`)
 * - Proxy mode via {@link DeepgramFluxConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 *
 * **Transport:** WebSocket (via `@deepgram/sdk` V5 `listen.v2`)
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * Requires the `@deepgram/sdk` (v5+) peer dependency to be installed.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> DeepgramFlux WebSocket
 *                                                       |
 * CompositeVoice <- onTranscription(result) <----------+
 * ```
 *
 * @example
 * ```ts
 * import { DeepgramFlux } from 'composite-voice';
 *
 * const stt = new DeepgramFlux({
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   options: {
 *     model: 'flux-general-en',
 *     eagerEotThreshold: 0.5,
 *     eotThreshold: 0.7,
 *   },
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   if (result.isPreflight) {
 *     console.log('Eager end-of-turn:', result.text);
 *   } else if (result.isFinal && result.speechFinal) {
 *     console.log('Complete utterance:', result.text);
 *   }
 * });
 *
 * await stt.connect();
 * // ... send audio chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link DeepgramFluxConfig} for configuration options
 * @see {@link DeepgramFluxOptions} for transcription parameters
 * @see {@link DeepgramSTT} for the V1 (Nova) Deepgram STT provider
 */
export class DeepgramFlux extends LiveSTTProvider {
  declare public config: DeepgramFluxConfig;

  /**
   * The Deepgram SDK V5 client instance.
   *
   * @remarks
   * Typed as `any` because the `@deepgram/sdk` V5 peer dependency is
   * dynamically imported at runtime. The actual type is
   * `InstanceType<typeof import('@deepgram/sdk').DeepgramClient>`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private deepgram: any = null;

  /**
   * The active V2 live transcription socket.
   *
   * @remarks
   * Uses the `listen.v2.connect()` method from SDK V5 which returns a socket
   * that emits structured `message` events rather than the V1 event names.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Create a new DeepgramFlux provider.
   *
   * @param config - Deepgram Flux STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new DeepgramFlux({
   *   apiKey: 'dg_abc123...',
   *   options: { model: 'flux-general-en' },
   * });
   * ```
   */
  constructor(config: DeepgramFluxConfig, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Dynamically import the Deepgram SDK V5 and create the client.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is configured, or when
   * the `@deepgram/sdk` peer dependency is not installed.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'DeepgramFlux',
        new Error('DeepgramFlux requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Deepgram SDK V5 (peer dependency).
      // The V5 SDK exports `DeepgramClient` which accepts `{ apiKey, baseUrl }`.
      // We cast to `any` because the project may have an older SDK version
      // installed at compile time while targeting V5 at runtime.
      const { DeepgramClient: DGClient } = await import('@deepgram/sdk');

      if (this.config.proxyUrl) {
        // Proxy mode: redirect all SDK connections to the proxy server.
        // The proxy injects the real Deepgram API key server-side.
        // Convert http(s) -> ws(s) for the SDK's WebSocket URL.
        const wsUrl = this.config.proxyUrl.replace(/^http/, 'ws');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.deepgram = new (DGClient as any)({ apiKey: 'proxy', baseUrl: wsUrl });
        this.logger.info('Deepgram Flux initialized (proxy mode)', { proxyUrl: wsUrl });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.deepgram = new (DGClient as any)({ apiKey: this.config.apiKey as string });
        this.logger.info('Deepgram Flux initialized (direct mode)', {
          model: this.config.options?.model ?? 'flux-general-en',
        });
      }
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'DeepgramFlux',
          new Error(
            'Deepgram SDK V5 not found. Install with: npm install @deepgram/sdk@^5\n' +
              'The Deepgram SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('DeepgramFlux', error as Error);
    }
  }

  /** Disconnect the WebSocket (if connected) and release SDK resources. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.socket = null;
    this.deepgram = null;
    this.logger.info('Deepgram Flux disposed');
  }

  /**
   * Open a V2 WebSocket connection to Deepgram for real-time transcription.
   *
   * @remarks
   * Builds connection options from {@link DeepgramFluxConfig} and waits for
   * the `Connected` message before resolving. The connection timeout
   * defaults to {@link DeepgramFluxConfig.timeout | config.timeout} (10 000 ms).
   *
   * All V2 connect parameters are passed as strings per the SDK V5 API spec.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the Deepgram client is
   * missing, or the connection times out / errors.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram Flux');
      return;
    }

    if (!this.deepgram) {
      throw new ProviderConnectionError(
        'DeepgramFlux',
        new Error('Deepgram client not initialized')
      );
    }

    try {
      this.logger.debug('Connecting to Deepgram Flux V2 WebSocket');

      // Build V2 connection options -- all values are strings per the V5 API
      const opts = this.config.options;
      const connectOptions: Record<string, unknown> = {
        model: opts?.model ?? 'flux-general-en',
      };

      if (opts?.encoding !== undefined) {
        connectOptions.encoding = String(opts.encoding);
      }
      if (opts?.sampleRate !== undefined) {
        connectOptions.sample_rate = String(opts.sampleRate);
      }
      if (opts?.eotThreshold !== undefined) {
        connectOptions.eot_threshold = String(opts.eotThreshold);
      }
      if (opts?.eagerEotThreshold !== undefined) {
        connectOptions.eager_eot_threshold = String(opts.eagerEotThreshold);
      }
      if (opts?.eotTimeoutMs !== undefined) {
        connectOptions.eot_timeout_ms = String(opts.eotTimeoutMs);
      }
      if (opts?.keyterms && opts.keyterms.length > 0) {
        connectOptions.keyterm = opts.keyterms;
      }
      if (opts?.tag !== undefined) {
        connectOptions.tag = String(opts.tag);
      }
      if (opts?.mipOptOut !== undefined) {
        connectOptions.mip_opt_out = String(opts.mipOptOut);
      }

      // Open the V2 WebSocket
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket = await (this.deepgram.listen as any).v2.connect(connectOptions);

      // Wait for the Connected message before resolving
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout ?? 10000);

        // V2 delivers all events through a single `message` handler
        this.socket.on('message', (msg: ListenV2Message) => {
          if (msg.type === 'Connected') {
            clearTimeout(timeout);
            this.isConnected = true;
            this.logger.info('Connected to Deepgram Flux V2 WebSocket', {
              requestId: msg.request_id,
            });

            // Now that we are connected, wire up the full message handler
            this.setupMessageHandler();
            resolve();
          } else if (msg.type === 'FatalError') {
            clearTimeout(timeout);
            this.logger.error('Deepgram Flux fatal error during connect', {
              error: (msg as ListenV2FatalError).error,
              description: (msg as ListenV2FatalError).description,
            });
            reject(
              new Error(
                `Deepgram Flux: ${(msg as ListenV2FatalError).error} - ${(msg as ListenV2FatalError).description}`
              )
            );
          }
        });

        this.socket.on('error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('Failed to connect to Deepgram Flux V2 WebSocket', error);
          reject(error);
        });
      });
    } catch (error) {
      this.socket = null;
      throw new ProviderConnectionError('DeepgramFlux', error as Error);
    }
  }

  /**
   * Wire up the persistent `message` handler on the V2 socket.
   *
   * @remarks
   * The V2 API delivers all events (`TurnInfo`, `FatalError`) via a single
   * `message` event. This method sets up the handler that routes each
   * message type to the appropriate processing logic.
   */
  private setupMessageHandler(): void {
    if (!this.socket) return;

    this.socket.on('message', (msg: ListenV2Message) => {
      try {
        switch (msg.type) {
          case 'TurnInfo':
            this.handleTurnInfo(msg as ListenV2TurnInfo);
            break;

          case 'FatalError': {
            const fatalMsg = msg as ListenV2FatalError;
            this.logger.error('Deepgram Flux fatal error', {
              error: fatalMsg.error,
              description: fatalMsg.description,
            });

            const errorResult: TranscriptionResult = {
              text: '',
              isFinal: true,
              confidence: 0,
              metadata: {
                error: fatalMsg.error,
                description: fatalMsg.description,
              },
            };
            this.emitTranscription(errorResult);
            break;
          }

          case 'Connected':
            // Already handled during connect(); ignore subsequent Connected messages
            this.logger.debug('Received additional Connected message (ignored)');
            break;

          default:
            this.logger.debug('Unknown V2 message type', msg);
            break;
        }
      } catch (error) {
        this.logger.error('Error processing V2 message', error);
      }
    });

    // Handle transport-level errors
    this.socket.on('error', (error: Error) => {
      this.logger.error('Deepgram Flux WebSocket error', error);

      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: error.message,
        },
      };
      this.emitTranscription(errorResult);
    });

    // Handle close
    this.socket.on('close', () => {
      this.logger.info('Deepgram Flux V2 WebSocket closed');
      this.isConnected = false;
    });
  }

  /**
   * Process a `TurnInfo` event and emit the corresponding
   * {@link TranscriptionResult}.
   *
   * @remarks
   * Maps V2 turn events to the CompositeVoice transcription model:
   *
   * | V2 event            | `isFinal` | `isPreflight` | `speechFinal` |
   * | ------------------- | --------- | ------------- | ------------- |
   * | `StartOfTurn`       | `false`   | -             | -             |
   * | `Update`            | `false`   | -             | -             |
   * | `EagerEndOfTurn`    | `false`   | `true`        | -             |
   * | `TurnResumed`       | `false`   | -             | -             |
   * | `EndOfTurn`         | `true`    | -             | `true`        |
   *
   * @param turnInfo - The `ListenV2TurnInfo` message to process.
   */
  private handleTurnInfo(turnInfo: ListenV2TurnInfo): void {
    const {
      event,
      transcript,
      words,
      turn_index: turnIndex,
      end_of_turn_confidence: endOfTurnConfidence,
      audio_window_start: audioWindowStart,
      audio_window_end: audioWindowEnd,
    } = turnInfo;

    switch (event) {
      case 'StartOfTurn': {
        this.logger.debug('Deepgram Flux StartOfTurn', { turnIndex });
        this.emitTranscription({
          text: '',
          isFinal: false,
          metadata: {
            event: 'start_of_turn',
            turnIndex,
            endOfTurnConfidence,
          },
        });
        break;
      }

      case 'Update': {
        if (!transcript) return;

        const avgConfidence = this.computeAverageConfidence(words);

        this.logger.debug('Deepgram Flux Update', {
          transcript,
          turnIndex,
          avgConfidence,
        });

        this.emitTranscription({
          text: transcript,
          isFinal: false,
          ...(avgConfidence !== undefined && { confidence: avgConfidence }),
          metadata: {
            event: 'update',
            turnIndex,
            words,
            audioWindow: { start: audioWindowStart, end: audioWindowEnd },
          },
        });
        break;
      }

      case 'EagerEndOfTurn': {
        this.logger.debug('Deepgram Flux EagerEndOfTurn (preflight)', {
          transcript,
          turnIndex,
          endOfTurnConfidence,
        });

        this.emitTranscription({
          text: transcript,
          isFinal: false,
          isPreflight: true,
          confidence: endOfTurnConfidence,
          metadata: {
            event: 'eager_end_of_turn',
            turnIndex,
            words,
          },
        });
        break;
      }

      case 'TurnResumed': {
        this.logger.debug('Deepgram Flux TurnResumed', {
          transcript,
          turnIndex,
        });

        this.emitTranscription({
          text: transcript,
          isFinal: false,
          metadata: {
            event: 'turn_resumed',
            turnIndex,
          },
        });
        break;
      }

      case 'EndOfTurn': {
        this.logger.debug('Deepgram Flux EndOfTurn', {
          transcript,
          turnIndex,
          endOfTurnConfidence,
        });

        this.emitTranscription({
          text: transcript,
          isFinal: true,
          speechFinal: true,
          confidence: endOfTurnConfidence,
          metadata: {
            event: 'end_of_turn',
            turnIndex,
            words,
          },
        });
        break;
      }

      default:
        this.logger.debug('Unknown TurnInfo event', { event, turnIndex });
        break;
    }
  }

  /**
   * Compute the average confidence score across an array of word results.
   *
   * @param words - Array of word objects with `confidence` scores.
   * @returns The arithmetic mean confidence, or `undefined` when the array
   *   is empty.
   */
  private computeAverageConfidence(words: TurnInfoWord[]): number | undefined {
    if (!words || words.length === 0) return undefined;
    const sum = words.reduce((acc, w) => acc + w.confidence, 0);
    return sum / words.length;
  }

  /**
   * Send a raw audio chunk to Deepgram for real-time transcription.
   *
   * @remarks
   * The chunk is sent via the V2 `sendMedia` method. If the connection is
   * not open, the chunk is silently dropped and a warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.socket.sendMedia(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Gracefully close the Deepgram Flux V2 WebSocket connection.
   *
   * @remarks
   * Sends a `CloseStream` message via `sendCloseStream`, then waits up to
   * 1 second for the `close` event before force-resolving. Resets internal
   * connection state.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Not connected to Deepgram Flux');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram Flux V2 WebSocket');

      // Signal end of stream
      this.socket.sendCloseStream({ type: 'CloseStream' });

      // Wait for close event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.socket?.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isConnected = false;
      this.socket = null;

      this.logger.info('Disconnected from Deepgram Flux V2 WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram Flux', error);
      throw error;
    }
  }

  /**
   * Check whether the Deepgram Flux V2 WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Send a keep-alive signal to prevent the V2 WebSocket from timing out.
   *
   * @remarks
   * Uses the `sendCloseStream` method with a `KeepAlive` type to keep the
   * connection alive without ending the stream.
   */
  sendKeepAlive(): void {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Cannot send keep-alive: not connected');
      return;
    }

    try {
      this.socket.sendCloseStream({ type: 'KeepAlive' });
      this.logger.debug('Sent keep-alive to Deepgram Flux V2');
    } catch (error) {
      this.logger.error('Failed to send keep-alive', error);
    }
  }
}
