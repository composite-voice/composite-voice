/**
 * ElevenLabs real-time speech-to-text provider.
 *
 * @remarks
 * This module provides a WebSocket-based real-time STT provider powered by
 * ElevenLabs Scribe V2. Audio chunks are base64-encoded, sent as JSON messages,
 * and transcription results (partial and committed) are streamed back in
 * real time.
 *
 * Transport: WebSocket (direct to ElevenLabs or via proxy)
 * Audio format: Configurable PCM or mu-law at various sample rates;
 * default is `pcm_16000` (16-bit PCM at 16 kHz)
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderConnectionError } from '../../../utils/errors';

/**
 * ElevenLabs STT model identifiers.
 *
 * @remarks
 * - `scribe_v2_realtime` -- Latest real-time streaming transcription model
 *
 * Custom model IDs are also accepted via the `string & {}` type widening.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type ElevenLabsSTTModel = 'scribe_v2_realtime' | (string & {});

/**
 * ElevenLabs STT audio format identifiers.
 *
 * @remarks
 * The format string encodes the encoding type and sample rate:
 * - `pcm_16000` -- 16-bit PCM at 16 kHz (default)
 * - `pcm_22050` -- 16-bit PCM at 22.05 kHz
 * - `pcm_24000` -- 16-bit PCM at 24 kHz
 * - `pcm_44100` -- 16-bit PCM at 44.1 kHz
 * - `mulaw_8000` -- mu-law at 8 kHz (telephony)
 *
 * Custom format strings are also accepted via the `string & {}` type widening.
 */
export type ElevenLabsSTTAudioFormat =
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'mulaw_8000'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Configuration options for the ElevenLabs STT provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with ElevenLabs-specific settings.
 * You must provide **either** `apiKey` / `token` (for direct browser-to-ElevenLabs
 * connections) or `proxyUrl` (for a server-side proxy that injects the
 * API key). If `proxyUrl` is provided, it takes precedence.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: ElevenLabsSTTConfig = {
 *   apiKey: 'el-xxxxxxxxxxxx',
 *   model: 'scribe_v2_realtime',
 *   commitStrategy: 'vad',
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: ElevenLabsSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/elevenlabs',
 *   audioFormat: 'pcm_16000',
 *   includeTimestamps: true,
 * };
 * ```
 *
 * @see {@link ElevenLabsSTTModel} - Available model options.
 * @see {@link ElevenLabsSTTAudioFormat} - Available audio format options.
 */
export interface ElevenLabsSTTConfig extends STTProviderConfig {
  /**
   * ElevenLabs API key for direct authentication.
   * Required when connecting directly to ElevenLabs without a proxy.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's ElevenLabs endpoint.
   * Example: `'http://localhost:3000/api/proxy/elevenlabs'`
   */
  proxyUrl?: string;

  /**
   * Temporary authentication token for WebSocket connections.
   * Alternative to `apiKey` for short-lived browser sessions.
   */
  token?: string;

  /**
   * STT model to use for transcription.
   * @default 'scribe_v2_realtime'
   */
  model?: ElevenLabsSTTModel;

  /**
   * Strategy for committing transcription segments.
   * - `'vad'` -- Voice Activity Detection automatically commits when silence is detected
   * - `'manual'` -- Application controls when to commit via explicit signals
   * @default 'vad'
   */
  commitStrategy?: 'vad' | 'manual';

  /**
   * Audio encoding format sent to the API.
   * @default 'pcm_16000'
   */
  audioFormat?: ElevenLabsSTTAudioFormat;

  /**
   * Duration of silence (in seconds) before VAD considers speech ended.
   * Only applies when `commitStrategy` is `'vad'`.
   */
  vadSilenceThresholdSecs?: number;

  /**
   * VAD sensitivity threshold (0.0 to 1.0).
   * Higher values require louder speech to trigger detection.
   * Only applies when `commitStrategy` is `'vad'`.
   */
  vadThreshold?: number;

  /**
   * Minimum speech duration in milliseconds before it is considered valid.
   * Helps filter out very short noise bursts.
   */
  minSpeechDurationMs?: number;

  /**
   * Minimum silence duration in milliseconds before a speech segment ends.
   */
  minSilenceDurationMs?: number;

  /**
   * Whether to include word-level timestamps in transcription results.
   * @default false
   */
  includeTimestamps?: boolean;

  /**
   * Whether to include automatic language detection in results.
   */
  includeLanguageDetection?: boolean;

  /**
   * Previous text context to improve transcription accuracy.
   * Useful for maintaining context across sessions.
   * Should be kept short (approximately 50 characters or less).
   */
  previousText?: string;

  /**
   * Whether to enable logging on the ElevenLabs side.
   * When `false`, enables zero-retention mode where no audio or transcripts
   * are stored by ElevenLabs.
   */
  enableLogging?: boolean;
}

/**
 * Maps ElevenLabs audio format strings to their sample rates in Hz.
 *
 * @internal
 */
const FORMAT_SAMPLE_RATES: Record<string, number> = {
  pcm_16000: 16000,
  pcm_22050: 22050,
  pcm_24000: 24000,
  pcm_44100: 44100,
  mulaw_8000: 8000,
};

/**
 * ElevenLabs STT provider for real-time streaming speech-to-text via WebSocket.
 *
 * @remarks
 * This provider establishes a WebSocket connection to the ElevenLabs Scribe V2
 * real-time STT API (or a proxy server). Audio chunks are base64-encoded and
 * sent as JSON `input_audio_chunk` messages. Transcription results are received
 * as `partial_transcript` and `committed_transcript` messages.
 *
 * The lifecycle is:
 * 1. Construct with {@link ElevenLabsSTTConfig}
 * 2. Call `initialize()` to validate configuration and build the WebSocket URL
 * 3. Call `connect()` to open the WebSocket and wait for `session_started`
 * 4. Call `sendAudio()` to stream audio chunks for transcription
 * 5. Call `disconnect()` to close the WebSocket
 * 6. Call `dispose()` to release all resources
 *
 * Audio flow: `Microphone -> AudioCapture -> sendAudio(chunk) -> WebSocket -> Scribe V2`
 *
 * @example
 * ```typescript
 * import { ElevenLabsSTT } from 'composite-voice';
 *
 * const stt = new ElevenLabsSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/elevenlabs',
 *   model: 'scribe_v2_realtime',
 *   commitStrategy: 'vad',
 *   audioFormat: 'pcm_16000',
 * });
 *
 * await stt.initialize();
 * await stt.connect();
 *
 * stt.onTranscription((result) => {
 *   if (result.isFinal) {
 *     console.log('Final:', result.text);
 *   } else {
 *     console.log('Partial:', result.text);
 *   }
 * });
 *
 * // Stream audio chunks from microphone...
 * stt.sendAudio(audioChunk);
 *
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} - The base class this provider extends.
 * @see {@link ElevenLabsSTTConfig} - Configuration options for this provider.
 * @see {@link WebSocketManager} - The WebSocket manager used for connection handling.
 */
export class ElevenLabsSTT extends LiveSTTProvider {
  declare public config: ElevenLabsSTTConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;
  private wsUrl = '';
  private sentFirstChunk = false;
  private sessionId: string | null = null;

  /**
   * Creates a new ElevenLabsSTT provider instance.
   *
   * @param config - Configuration for the ElevenLabs STT provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: ElevenLabsSTTConfig, logger?: Logger) {
    const finalConfig: ElevenLabsSTTConfig = {
      model: 'scribe_v2_realtime',
      commitStrategy: 'vad',
      audioFormat: 'pcm_16000',
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validates configuration and builds the WebSocket URL with query parameters.
   *
   * Logs a debug warning if none of `apiKey`, `token`, or `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.token && !this.config.proxyUrl) {
      this.logger.debug(
        'No authentication method configured for ElevenLabsSTT. ' +
          'Provide "apiKey", "token", or "proxyUrl" for authenticated connections.'
      );
    }

    this.wsUrl = this.buildWebSocketUrl();

    // Log which authentication method will be used (priority: proxyUrl > token > apiKey)
    const authMethod = this.config.proxyUrl
      ? 'proxy'
      : this.config.token
        ? 'token'
        : this.config.apiKey
          ? 'apiKey'
          : 'none';

    this.logger.info('ElevenLabs STT initialized', {
      model: this.config.model,
      commitStrategy: this.config.commitStrategy,
      audioFormat: this.config.audioFormat,
      authMethod,
    });
  }

  /**
   * Disposes the provider, disconnecting and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.logger.info('ElevenLabs STT disposed');
  }

  /**
   * Builds the WebSocket URL for the ElevenLabs real-time STT endpoint.
   *
   * @remarks
   * When using a proxy, the HTTP URL is converted to a WebSocket URL.
   * For direct connections, the URL includes the model ID, audio format,
   * commit strategy, and VAD parameters as query parameters.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    // Priority: proxyUrl > token > apiKey
    if (this.config.proxyUrl) {
      // Proxy mode: convert http(s) to ws(s); the proxy injects
      // the xi-api-key header on the upstream connection server-side.
      return this.config.proxyUrl.replace(/^http/, 'ws');
    }

    const params = new URLSearchParams();

    // Authentication via query parameters (browser WebSocket cannot set headers).
    // Token takes precedence over apiKey when both are provided.
    if (this.config.token) {
      params.set('token', this.config.token);
    } else if (this.config.apiKey) {
      params.set('xi-api-key', this.config.apiKey);
    }

    // Model
    params.set('model_id', this.config.model ?? 'scribe_v2_realtime');

    // Audio format
    if (this.config.audioFormat) {
      params.set('audio_format', this.config.audioFormat);
    }

    // Language
    if (this.config.language) {
      params.set('language_code', this.config.language);
    }

    // Commit strategy
    if (this.config.commitStrategy) {
      params.set('commit_strategy', this.config.commitStrategy);
    }

    // VAD parameters
    if (this.config.vadSilenceThresholdSecs !== undefined) {
      params.set('vad_silence_threshold_secs', String(this.config.vadSilenceThresholdSecs));
    }
    if (this.config.vadThreshold !== undefined) {
      params.set('vad_threshold', String(this.config.vadThreshold));
    }
    if (this.config.minSpeechDurationMs !== undefined) {
      params.set('min_speech_duration_ms', String(this.config.minSpeechDurationMs));
    }
    if (this.config.minSilenceDurationMs !== undefined) {
      params.set('min_silence_duration_ms', String(this.config.minSilenceDurationMs));
    }

    // Feature flags
    if (this.config.includeTimestamps !== undefined) {
      params.set('include_timestamps', String(this.config.includeTimestamps));
    }
    if (this.config.includeLanguageDetection !== undefined) {
      params.set('include_language_detection', String(this.config.includeLanguageDetection));
    }
    if (this.config.enableLogging !== undefined) {
      params.set('enable_logging', String(this.config.enableLogging));
    }

    return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
  }

  /**
   * Opens a WebSocket connection and waits for the `session_started` message.
   *
   * @remarks
   * Establishes a WebSocket connection to the ElevenLabs real-time STT endpoint
   * (or proxy). The connect promise does not resolve until the server sends a
   * `session_started` message, ensuring the session is fully initialized before
   * audio streaming begins.
   *
   * Auto-reconnect is disabled because each STT session is stateful and cannot
   * be resumed after disconnection.
   *
   * @throws {@link ProviderConnectionError} if the connection fails or times out.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to ElevenLabs STT');
      return;
    }

    try {
      this.logger.debug('Connecting to ElevenLabs STT WebSocket');

      const wsOptions: WebSocketManagerOptions = {
        url: this.wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        reconnection: {
          enabled: false, // Disable auto-reconnect for stateful STT sessions
        },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Wait for session_started before resolving
      const sessionStartedPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for session_started message'));
        }, this.config.timeout ?? 10000);

        this.wsManager!.setHandlers({
          onMessage: (event: MessageEvent) => {
            try {
              const message = JSON.parse(event.data as string);

              if (message.message_type === 'session_started') {
                clearTimeout(timeout);
                this.sessionId = message.session_id ?? null;
                this.logger.info('ElevenLabs STT session started', {
                  sessionId: this.sessionId,
                  model: this.config.model,
                  commitStrategy: this.config.commitStrategy,
                  audioFormat: this.config.audioFormat,
                });

                // Switch to normal message handling after handshake
                this.wsManager!.setHandlers({
                  onMessage: (evt: MessageEvent) => this.handleMessage(evt),
                  onClose: () => {
                    this.logger.info('ElevenLabs STT WebSocket closed');
                    this.isConnected = false;
                  },
                  onError: (error: Error) => {
                    this.logger.error('ElevenLabs STT WebSocket error', error);
                  },
                });

                resolve();
              } else if (message.message_type === 'input_error') {
                clearTimeout(timeout);
                reject(new Error(message.message ?? 'ElevenLabs STT connection error'));
              }
            } catch {
              // Non-JSON message during handshake, ignore
            }
          },
          onClose: () => {
            clearTimeout(timeout);
            this.isConnected = false;
            reject(new Error('WebSocket closed before session started'));
          },
          onError: (error: Error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
      });

      await this.wsManager.connect();
      await sessionStartedPromise;

      this.isConnected = true;
      this.sentFirstChunk = false;

      this.logger.info('Connected to ElevenLabs STT', {
        model: this.config.model,
      });
    } catch (error) {
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('ElevenLabsSTT', error as Error);
    }
  }

  /**
   * Handles incoming WebSocket messages containing transcription data or errors.
   *
   * @remarks
   * ElevenLabs sends several message types:
   * - `partial_transcript` -- Interim transcription (real-time updates)
   * - `committed_transcript` -- Final transcription for a speech segment
   * - `committed_transcript_with_timestamps` -- Final transcription with word timings
   * - `input_error` -- Error in processing audio input
   * - `session_ended` -- Session has been terminated
   *
   * @param event - The WebSocket `MessageEvent` to process.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data as string);

      switch (message.message_type) {
        case 'partial_transcript': {
          const text: string = message.text ?? '';
          // Do not emit empty partial transcripts
          if (!text) break;
          this.emitTranscription({
            text,
            isFinal: false,
            speechFinal: false,
          });
          break;
        }

        case 'committed_transcript':
          this.emitTranscription({
            text: message.text ?? '',
            isFinal: true,
            speechFinal: true,
          });
          break;

        case 'committed_transcript_with_timestamps': {
          const words: Array<{ word: string; logprob?: number }> = message.words ?? [];
          const text = words.map((w) => w.word).join(' ');
          // Compute average confidence from word-level logprobs
          const wordsWithLogprob = words.filter(
            (w): w is { word: string; logprob: number } => typeof w.logprob === 'number'
          );
          const confidence =
            wordsWithLogprob.length > 0
              ? wordsWithLogprob.reduce((sum, w) => sum + Math.exp(w.logprob), 0) /
                wordsWithLogprob.length
              : undefined;
          this.emitTranscription({
            text,
            isFinal: true,
            speechFinal: true,
            ...(confidence !== undefined && { confidence }),
            metadata: { words: message.words },
          });
          break;
        }

        case 'input_error':
          this.logger.error('ElevenLabs STT input error', {
            code: message.code,
            message: message.message,
          });
          this.emitTranscription({
            text: '',
            isFinal: true,
            confidence: 0,
            metadata: { errorType: message.code, error: message.message },
          });
          break;

        case 'session_ended':
          this.logger.info('ElevenLabs STT session ended');
          break;

        default:
          this.logger.debug('Unknown ElevenLabs STT message type', {
            messageType: message.message_type,
          });
      }
    } catch (error) {
      this.logger.error('Error processing ElevenLabs STT message', error);
    }
  }

  /**
   * Sends a raw audio chunk to ElevenLabs for real-time transcription.
   *
   * @remarks
   * The audio `ArrayBuffer` is base64-encoded and sent as an `input_audio_chunk`
   * JSON message. The `previous_text` context field is included only on the
   * first audio chunk (when configured), to provide transcription context
   * without sending it repeatedly.
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   */
  sendAudio(chunk: ArrayBuffer): void {
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

      const sampleRate = this.getSampleRate();
      const message: Record<string, unknown> = {
        message_type: 'input_audio_chunk',
        audio_base_64: base64Audio,
        commit: false,
        sample_rate: sampleRate,
      };

      // Send previousText only on the first audio chunk
      if (!this.sentFirstChunk) {
        if (this.config.previousText) {
          message.previous_text = this.config.previousText;
        }
        this.sentFirstChunk = true;
      }

      this.wsManager.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Disconnects from the ElevenLabs WebSocket.
   *
   * @remarks
   * Sends a final commit message to flush any buffered audio, waits briefly
   * for remaining transcription results, then gracefully closes the WebSocket
   * connection and releases the {@link WebSocketManager} instance.
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.wsManager) return;

    try {
      this.logger.debug('Disconnecting from ElevenLabs STT WebSocket');

      // Send a final commit to flush buffered audio
      try {
        this.wsManager.send(
          JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: '',
            commit: true,
            sample_rate: this.getSampleRate(),
          })
        );
      } catch {
        // Ignore errors if the socket is already closing
      }

      // Wait briefly for final transcription to arrive
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        if (!this.wsManager?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.sentFirstChunk = false;
      this.sessionId = null;
      this.wsManager = null;

      this.logger.info('Disconnected from ElevenLabs STT');
    } catch (error) {
      this.logger.error('Error disconnecting from ElevenLabs STT', error);
      throw error;
    }
  }

  /**
   * Derives the sample rate from the configured audio format.
   *
   * @returns The sample rate in Hz corresponding to the audio format.
   */
  private getSampleRate(): number {
    const format = this.config.audioFormat ?? 'pcm_16000';
    return FORMAT_SAMPLE_RATES[format] ?? 16000;
  }

  /**
   * Checks whether the WebSocket connection to ElevenLabs is currently active.
   *
   * @returns `true` if the WebSocket is connected, `false` otherwise.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
