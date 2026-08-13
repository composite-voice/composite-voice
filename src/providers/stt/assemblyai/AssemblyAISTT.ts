/**
 * AssemblyAI real-time speech-to-text provider using the WebSocket
 * transcription API.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Configuration options for the {@link AssemblyAISTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with AssemblyAI-specific settings.
 * You must provide **either** `apiKey` (for direct browser-to-AssemblyAI
 * connections) or `proxyUrl` (for a server-side proxy that injects the
 * API key). If both are provided, `proxyUrl` takes precedence.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: AssemblyAISTTConfig = {
 *   apiKey: 'aai_abc123...',
 *   sampleRate: 16000,
 *   language: 'en',
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: AssemblyAISTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/assemblyai',
 *   sampleRate: 16000,
 *   wordBoost: ['CompositeVoice', 'Deepgram'],
 * };
 * ```
 *
 * @see {@link AssemblyAISTT} for the provider class
 */
export interface AssemblyAISTTConfig extends STTProviderConfig {
  /**
   * AssemblyAI API key.
   * Required when connecting directly to AssemblyAI.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's AssemblyAI endpoint.
   * Example: `'http://localhost:3000/api/proxy/assemblyai'`
   */
  proxyUrl?: string;
  /**
   * Audio sample rate in Hz.
   * @default 16000
   */
  sampleRate?: number;
  /**
   * Optional list of words to boost recognition accuracy.
   * AssemblyAI will prioritize these words during transcription.
   */
  wordBoost?: string[];
  /**
   * Language code for transcription.
   * @default 'en'
   */
  language?: string;
}

/**
 * Internal message types received from the AssemblyAI real-time WebSocket.
 * @internal
 */
interface AssemblyAISessionBeginsMessage {
  message_type: 'SessionBegins';
  session_id: string;
  expires_at: string;
}

interface AssemblyAIPartialTranscriptMessage {
  message_type: 'PartialTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence: number;
  words: Array<{ text: string; start: number; end: number; confidence: number }>;
}

interface AssemblyAIFinalTranscriptMessage {
  message_type: 'FinalTranscript';
  text: string;
  audio_start: number;
  audio_end: number;
  confidence: number;
  words: Array<{ text: string; start: number; end: number; confidence: number }>;
  punctuated: boolean;
  text_formatted: boolean;
}

interface AssemblyAISessionTerminatedMessage {
  message_type: 'SessionTerminated';
}

interface AssemblyAIErrorMessage {
  error: string;
}

type AssemblyAIMessage =
  | AssemblyAISessionBeginsMessage
  | AssemblyAIPartialTranscriptMessage
  | AssemblyAIFinalTranscriptMessage
  | AssemblyAISessionTerminatedMessage
  | AssemblyAIErrorMessage;

/**
 * AssemblyAI real-time STT provider using a raw WebSocket connection.
 *
 * @remarks
 * `AssemblyAISTT` extends {@link LiveSTTProvider} and connects to
 * AssemblyAI's real-time transcription WebSocket API. Audio is sent as
 * base64-encoded JSON messages and transcription results are received as
 * `PartialTranscript` and `FinalTranscript` messages.
 *
 * Key features:
 *
 * - Interim (partial) and final transcription results
 * - Word-level timestamps and confidence scores
 * - Word boost for domain-specific vocabulary
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager})
 * - Proxy mode via {@link AssemblyAISTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required -- the provider uses a raw WebSocket
 * connection managed by the SDK's built-in {@link WebSocketManager}.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> base64 JSON -> AssemblyAI WS
 *                                                                       |
 * CompositeVoice <- onTranscription(result) <--------------------------+
 * ```
 *
 * @example
 * ```ts
 * import { AssemblyAISTT } from 'composite-voice';
 *
 * const stt = new AssemblyAISTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/assemblyai',
 *   sampleRate: 16000,
 *   language: 'en',
 *   wordBoost: ['CompositeVoice'],
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
 * // ... send audio chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link AssemblyAISTTConfig} for configuration options
 * @see {@link DeepgramSTT} for an alternative real-time STT provider
 */
export class AssemblyAISTT extends LiveSTTProvider {
  declare public config: AssemblyAISTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Create a new AssemblyAISTT provider.
   *
   * @param config - AssemblyAI STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new AssemblyAISTT({
   *   apiKey: 'aai_abc123...',
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: AssemblyAISTTConfig, logger?: Logger) {
    const finalConfig: AssemblyAISTTConfig = {
      sampleRate: 16000,
      language: 'en',
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
        'AssemblyAISTT',
        new Error('AssemblyAISTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    this.logger.info('AssemblyAI STT initialized', {
      sampleRate: this.config.sampleRate,
      language: this.config.language,
      hasWordBoost: !!(this.config.wordBoost && this.config.wordBoost.length > 0),
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
    this.logger.info('AssemblyAI STT disposed');
  }

  /**
   * Build the WebSocket URL for AssemblyAI real-time transcription.
   *
   * @remarks
   * When {@link AssemblyAISTTConfig.proxyUrl | proxyUrl} is set, converts
   * `http(s)` to `ws(s)`. Otherwise builds the direct AssemblyAI URL with
   * `sample_rate`, optional `word_boost`, and `token` query parameters.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    if (this.config.proxyUrl) {
      // Convert http(s) to ws(s) for proxy
      return this.config.proxyUrl.replace(/^http/, 'ws');
    }

    const sampleRate = this.config.sampleRate ?? 16000;
    let url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sampleRate}`;

    if (this.config.wordBoost && this.config.wordBoost.length > 0) {
      url += `&word_boost=${encodeURIComponent(JSON.stringify(this.config.wordBoost))}`;
    }

    if (this.config.apiKey) {
      url += `&token=${this.config.apiKey}`;
    }

    return url;
  }

  /**
   * Open a WebSocket connection to AssemblyAI for real-time transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection disabled — a dead
   * socket must surface immediately via onConnectionLost so the SDK (or a
   * FallbackSTT chain) can recover. The SDK drives reconnection through
   * {@link connect}. Sets up message handlers and waits for the connection
   * to open. The connection timeout defaults to
   * {@link AssemblyAISTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to AssemblyAI STT');
      return;
    }

    try {
      this.logger.debug('Connecting to AssemblyAI STT WebSocket');

      const wsUrl = this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: silent background retries dropped every
        // audio chunk for the length of the backoff (~31s) before the session
        // was declared dead. A lost socket now surfaces immediately via
        // onConnectionLost so the SDK — or a FallbackSTT chain, which buffers
        // audio across the swap — can recover without losing speech.
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
          this.logger.info('AssemblyAI STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('AssemblyAI STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`AssemblyAI STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();
      this.isConnected = true;

      this.logger.info('Connected to AssemblyAI STT WebSocket', {
        sampleRate: this.config.sampleRate,
        language: this.config.language,
      });
    } catch (error) {
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('AssemblyAISTT', error as Error);
    }
  }

  /**
   * Parse and dispatch incoming WebSocket messages from AssemblyAI.
   *
   * @remarks
   * Handles `SessionBegins`, `PartialTranscript`, `FinalTranscript`,
   * `SessionTerminated`, and error messages. Transcription results are
   * forwarded via {@link emitTranscription}.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from AssemblyAI, ignoring');
        return;
      }

      const message: AssemblyAIMessage = JSON.parse(event.data);

      // Handle error messages
      if ('error' in message) {
        this.logger.error('AssemblyAI error', { error: message.error });
        this.emitTranscription({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: message.error,
          },
        });
        return;
      }

      switch (message.message_type) {
        case 'SessionBegins':
          this.logger.info('AssemblyAI session started', {
            sessionId: message.session_id,
            expiresAt: message.expires_at,
          });
          break;

        case 'PartialTranscript':
          if (message.text) {
            this.emitTranscription({
              text: message.text,
              isFinal: false,
              confidence: message.confidence,
              metadata: {
                audioStart: message.audio_start,
                audioEnd: message.audio_end,
                words: message.words,
              },
            });
          }
          break;

        case 'FinalTranscript':
          if (message.text) {
            this.emitTranscription({
              text: message.text,
              isFinal: true,
              speechFinal: true,
              utteranceComplete: true,
              confidence: message.confidence,
              metadata: {
                audioStart: message.audio_start,
                audioEnd: message.audio_end,
                words: message.words,
                punctuated: message.punctuated,
                textFormatted: message.text_formatted,
              },
            });
          }
          break;

        case 'SessionTerminated':
          this.logger.info('AssemblyAI session terminated');
          break;

        default:
          this.logger.debug('Unknown AssemblyAI message type', { message });
          break;
      }
    } catch (error) {
      this.logger.error('Error processing AssemblyAI WebSocket message', error);
    }
  }

  /**
   * Send a raw audio chunk to AssemblyAI for real-time transcription.
   *
   * @remarks
   * The `ArrayBuffer` is converted to a base64-encoded string and wrapped
   * in a JSON `{ audio_data: "..." }` message, which is the format
   * required by AssemblyAI's real-time API. If the connection is not
   * open, the chunk is silently dropped and a warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(chunk);
      const parts: string[] = [];
      for (let i = 0; i < bytes.length; i++) {
        parts.push(String.fromCharCode(bytes[i] as number));
      }
      const base64Audio = btoa(parts.join(''));

      const message = JSON.stringify({
        audio_data: base64Audio,
      });

      this.wsManager.send(message);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Gracefully close the AssemblyAI WebSocket connection.
   *
   * @remarks
   * Sends a `{ terminate_session: true }` message to AssemblyAI, waits
   * briefly for the `SessionTerminated` response, then disconnects the
   * underlying {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to AssemblyAI STT');
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
      this.logger.debug('Disconnecting from AssemblyAI STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Send terminate session message
      try {
        this.wsManager.send(JSON.stringify({ terminate_session: true }));
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait briefly for SessionTerminated response, then disconnect
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000);

        if (!this.wsManager?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from AssemblyAI STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from AssemblyAI STT', error);
      throw error;
    }
  }

  /**
   * Check whether the AssemblyAI WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
