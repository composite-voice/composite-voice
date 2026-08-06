/**
 * Amazon Transcribe real-time speech-to-text provider using the streaming
 * WebSocket API with SigV4-presigned URLs.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';
import {
  presignAwsUrl,
  resolveAwsCredentials,
  type AwsCredentialsProvider,
} from '../../../utils/aws/sigv4';
import { encodeEventStreamMessage, decodeEventStreamMessage } from '../../../utils/aws/eventstream';

/**
 * Stability levels for Amazon Transcribe partial-results stabilization.
 *
 * @remarks
 * `'high'` stabilizes (and therefore emits) words faster with slightly
 * lower accuracy; `'low'` favors accuracy over latency.
 */
export type TranscribePartialResultsStability = 'high' | 'medium' | 'low';

/**
 * Configuration options for the {@link TranscribeSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Amazon Transcribe-specific settings.
 * You must provide **either** `credentials` + `region` (for direct
 * connections via a SigV4-presigned URL) or `proxyUrl` (for a server-side
 * proxy that presigns the upstream URL). If both are provided, `proxyUrl`
 * takes precedence.
 *
 * For direct browser connections, use temporary credentials (STS/Cognito)
 * fetched from your backend via an async `credentials` factory — never
 * embed long-lived AWS keys in client code.
 *
 * @example
 * ```ts
 * // Direct connection with a temporary-credentials factory
 * const config: TranscribeSTTConfig = {
 *   credentials: async () => {
 *     const res = await fetch('/api/aws-temp-credentials');
 *     return res.json(); // { accessKeyId, secretAccessKey, sessionToken }
 *   },
 *   region: 'us-east-1',
 *   languageCode: 'en-US',
 * };
 *
 * // Proxy connection (recommended for production)
 * const proxyConfig: TranscribeSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/transcribe',
 *   languageCode: 'en-US',
 * };
 * ```
 *
 * @see {@link TranscribeSTT} for the provider class
 */
export interface TranscribeSTTConfig extends STTProviderConfig {
  /**
   * AWS credentials, static or as an async factory.
   *
   * @remarks
   * Required in direct mode (no `proxyUrl`). A factory is invoked on every
   * `connect()` so each presigned URL uses fresh temporary credentials.
   */
  credentials?: AwsCredentialsProvider;

  /**
   * AWS region hosting the Transcribe streaming endpoint (e.g. `'us-east-1'`).
   *
   * @remarks
   * Required in direct mode; ignored in proxy mode (the proxy holds the region).
   */
  region?: string;

  /**
   * Language of the input audio (e.g. `'en-US'`, `'es-US'`, `'fr-FR'`).
   *
   * @remarks
   * Falls back to the base `language` option when omitted.
   *
   * @defaultValue `'en-US'`
   */
  languageCode?: string;

  /**
   * Encoding of the streamed audio.
   *
   * @remarks
   * `'pcm'` is signed 16-bit little-endian mono — the format the SDK's
   * `MicrophoneInput` produces.
   *
   * @defaultValue `'pcm'`
   */
  mediaEncoding?: 'pcm' | 'ogg-opus' | 'flac';

  /**
   * Audio sample rate in Hz (8000–48000).
   *
   * @defaultValue `16000`
   */
  sampleRate?: number;

  /**
   * Enable partial-results stabilization to reduce latency of interim results.
   *
   * @see {@link TranscribeSTTConfig.partialResultsStability}
   * @defaultValue `false`
   */
  enablePartialResultsStabilization?: boolean;

  /**
   * Stability level used when `enablePartialResultsStabilization` is on.
   *
   * @defaultValue Transcribe's server default (`'high'` is lowest latency)
   */
  partialResultsStability?: TranscribePartialResultsStability;

  /**
   * Name of a custom vocabulary to apply.
   */
  vocabularyName?: string;

  /**
   * Name of a custom vocabulary filter to apply.
   */
  vocabularyFilterName?: string;

  /**
   * How the vocabulary filter is applied (`remove`, `mask`, or `tag`).
   */
  vocabularyFilterMethod?: 'remove' | 'mask' | 'tag';

  /**
   * Enable speaker partitioning (diarization) — items carry a `Speaker` label.
   *
   * @defaultValue `false`
   */
  showSpeakerLabel?: boolean;

  /**
   * Enable automatic language identification.
   *
   * @remarks
   * When set, provide the candidate languages via
   * {@link TranscribeSTTConfig.languageOptions} and Transcribe ignores
   * `languageCode`.
   *
   * @defaultValue `false`
   */
  identifyLanguage?: boolean;

  /**
   * Candidate language codes for automatic language identification
   * (e.g. `['en-US', 'es-US']`). Requires `identifyLanguage`.
   */
  languageOptions?: string[];

  /**
   * Preferred language from {@link TranscribeSTTConfig.languageOptions},
   * to speed up language identification.
   */
  preferredLanguage?: string;

  /**
   * Session ID (UUID) for request tracking / session resume.
   */
  sessionId?: string;
}

/**
 * A single word/punctuation item in a Transcribe result.
 * @internal
 */
interface TranscribeItem {
  Content?: string;
  StartTime?: number;
  EndTime?: number;
  Type?: 'pronunciation' | 'punctuation';
  Confidence?: number;
  Speaker?: string;
  Stable?: boolean;
  VocabularyFilterMatch?: boolean;
}

/**
 * A transcription result segment from a Transcribe `TranscriptEvent`.
 * @internal
 */
interface TranscribeResult {
  ResultId?: string;
  StartTime?: number;
  EndTime?: number;
  IsPartial: boolean;
  LanguageCode?: string;
  Alternatives?: Array<{
    Transcript?: string;
    Items?: TranscribeItem[];
  }>;
}

/**
 * The JSON payload of a Transcribe `TranscriptEvent` message.
 * @internal
 */
interface TranscribeTranscriptEvent {
  Transcript?: {
    Results?: TranscribeResult[];
  };
}

/** @internal Query parameter set for the streaming WebSocket. */
type QueryParams = Record<string, string>;

/** @internal Path of the Transcribe streaming WebSocket endpoint. */
const TRANSCRIBE_WS_PATH = '/stream-transcription-websocket';

/** @internal Presigned URLs are valid for 5 minutes (the AWS maximum for WebSocket). */
const PRESIGN_EXPIRES_SECONDS = 300;

/**
 * Amazon Transcribe real-time STT provider using the streaming WebSocket API.
 *
 * @remarks
 * `TranscribeSTT` extends {@link LiveSTTProvider} and connects to Amazon
 * Transcribe's streaming endpoint over WebSocket. Authentication uses a
 * SigV4-**presigned URL** (browsers cannot set headers on WebSocket
 * handshakes), generated with the SDK's built-in WebCrypto signer.
 *
 * Audio is framed as binary `application/vnd.amazon.eventstream`
 * `AudioEvent` messages; Transcribe answers with event-stream
 * `TranscriptEvent` messages containing result segments:
 *
 * - Segments with `IsPartial: true` update continuously while the user
 *   speaks — emitted as interim results.
 * - When Transcribe detects the end of a segment (natural pause), it sends
 *   the segment once more with `IsPartial: false` — emitted as a final
 *   result with `utteranceComplete: true`, triggering the next pipeline
 *   stage.
 *
 * Key features:
 *
 * - Interim (partial) and final transcription results with word timing
 * - Optional partial-results stabilization for lower interim latency
 * - Optional speaker partitioning and automatic language identification
 * - Custom vocabularies and vocabulary filters
 * - Proxy mode via {@link TranscribeSTTConfig.proxyUrl} (recommended for
 *   production so AWS credentials stay server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers. No peer dependencies — SigV4
 * presigning and event-stream framing are implemented in the SDK with
 * WebCrypto.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> AudioEvent frames -> Transcribe WS
 *                                                                            |
 * CompositeVoice <- onTranscription(result) <-- TranscriptEvent decode <-----+
 * ```
 *
 * @example
 * ```ts
 * import { TranscribeSTT } from 'composite-voice';
 *
 * const stt = new TranscribeSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/transcribe',
 *   languageCode: 'en-US',
 *   enablePartialResultsStabilization: true,
 *   partialResultsStability: 'high',
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
 * // ... send 16 kHz pcm_s16le audio via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link TranscribeSTTConfig} for configuration options
 * @see {@link PollyTTS} for the matching AWS text-to-speech provider
 */
export class TranscribeSTT extends LiveSTTProvider {
  declare public config: TranscribeSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Create a new TranscribeSTT provider.
   *
   * @param config - Transcribe STT configuration. Must include either
   *   `credentials` + `region` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new TranscribeSTT({
   *   credentials: { accessKeyId: '...', secretAccessKey: '...' },
   *   region: 'us-east-1',
   *   languageCode: 'en-US',
   * });
   * ```
   */
  constructor(config: TranscribeSTTConfig, logger?: Logger) {
    const finalConfig: TranscribeSTTConfig = {
      mediaEncoding: 'pcm',
      sampleRate: 16000,
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate that either `credentials` + `region` or `proxyUrl` is configured.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `credentials` nor `proxyUrl` is set, or when
   * `region` is missing in direct mode.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.credentials && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'TranscribeSTT',
        new Error('TranscribeSTT requires either "credentials" or "proxyUrl" to be configured.')
      );
    }

    if (!this.isProxyMode && !this.config.region) {
      throw new ProviderInitializationError(
        'TranscribeSTT',
        new Error('TranscribeSTT requires "region" when using direct AWS credentials.')
      );
    }

    this.logger.info('Transcribe STT initialized', {
      languageCode: this.config.languageCode ?? this.config.language ?? 'en-US',
      mediaEncoding: this.config.mediaEncoding,
      sampleRate: this.config.sampleRate,
      region: this.config.region,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /** Disconnect the WebSocket (if connected) and release the manager. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting during dispose', error as Error);
      }
    }
    this.wsManager = null;
    this.logger.info('Transcribe STT disposed');
  }

  /**
   * Build the Transcribe streaming query parameters (kebab-case, as
   * required by the WebSocket endpoint).
   *
   * @internal
   */
  private buildQueryParams(): QueryParams {
    const params: QueryParams = {
      'media-encoding': this.config.mediaEncoding ?? 'pcm',
      'sample-rate': String(this.config.sampleRate ?? 16000),
    };

    if (this.config.identifyLanguage) {
      params['identify-language'] = 'true';
      if (this.config.languageOptions && this.config.languageOptions.length > 0) {
        params['language-options'] = this.config.languageOptions.join(',');
      }
      if (this.config.preferredLanguage) {
        params['preferred-language'] = this.config.preferredLanguage;
      }
    } else {
      params['language-code'] = this.config.languageCode ?? this.config.language ?? 'en-US';
    }

    if (this.config.enablePartialResultsStabilization) {
      params['enable-partial-results-stabilization'] = 'true';
      if (this.config.partialResultsStability) {
        params['partial-results-stability'] = this.config.partialResultsStability;
      }
    }

    if (this.config.vocabularyName) {
      params['vocabulary-name'] = this.config.vocabularyName;
    }

    if (this.config.vocabularyFilterName) {
      params['vocabulary-filter-name'] = this.config.vocabularyFilterName;
      if (this.config.vocabularyFilterMethod) {
        params['vocabulary-filter-method'] = this.config.vocabularyFilterMethod;
      }
    }

    if (this.config.showSpeakerLabel) {
      params['show-speaker-label'] = 'true';
    }

    if (this.config.sessionId) {
      params['session-id'] = this.config.sessionId;
    }

    return params;
  }

  /**
   * Build the WebSocket URL for Amazon Transcribe streaming.
   *
   * @remarks
   * - **Proxy mode:** `ws(s)://<proxyUrl>/stream-transcription-websocket?...`
   *   with plain (unsigned) query parameters — the proxy computes a
   *   presigned upstream URL with its own credentials.
   * - **Direct mode:** a SigV4-presigned
   *   `wss://transcribestreaming.<region>.amazonaws.com:8443/...` URL,
   *   valid for 5 minutes, carrying `X-Amz-*` auth parameters alongside
   *   the transcription parameters.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private async buildWebSocketUrl(): Promise<string> {
    const params = this.buildQueryParams();
    const query = new URLSearchParams(params).toString();

    if (this.isProxyMode) {
      const base = (this.config.proxyUrl as string).replace(/^http/, 'ws').replace(/\/$/, '');
      return `${base}${TRANSCRIBE_WS_PATH}?${query}`;
    }

    const credentials = await resolveAwsCredentials(
      this.config.credentials as AwsCredentialsProvider
    );
    const region = this.config.region as string;
    const endpoint =
      this.config.endpoint?.replace(/\/$/, '') ??
      `wss://transcribestreaming.${region}.amazonaws.com:8443`;

    return presignAwsUrl({
      url: `${endpoint}${TRANSCRIBE_WS_PATH}?${query}`,
      service: 'transcribe',
      region,
      credentials,
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
  }

  /**
   * Open a WebSocket connection to Amazon Transcribe streaming.
   *
   * @remarks
   * In direct mode a fresh presigned URL is computed on every call (and on
   * every call to an async `credentials` factory), so reconnects after the
   * 5-minute presign window require a new `connect()`. The connection
   * timeout defaults to
   * {@link TranscribeSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Transcribe STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Transcribe streaming WebSocket');

      const wsUrl = await this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Presigned URLs expire after 5 minutes, so blind reconnection with
        // the same URL would be rejected — reconnects go through connect().
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('Transcribe STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Transcribe STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Transcribe STT connection lost: ${error.message}`);
        },
      });

      await this.wsManager.connect();

      this.isConnected = true;

      this.logger.info('Connected to Transcribe streaming WebSocket', {
        languageCode: this.config.languageCode ?? this.config.language ?? 'en-US',
        mediaEncoding: this.config.mediaEncoding,
        sampleRate: this.config.sampleRate,
      });
    } catch (error) {
      // Close any half-open socket before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('TranscribeSTT', error as Error);
    }
  }

  /**
   * Decode and dispatch incoming event-stream messages from Transcribe.
   *
   * @remarks
   * Binary frames are decoded with the SDK's event-stream codec. Messages
   * with `:message-type: 'event'` and `:event-type: 'TranscriptEvent'`
   * carry transcription results; `:message-type: 'exception'` messages
   * (e.g. `BadRequestException`) are surfaced as error results.
   *
   * Browsers deliver binary WebSocket data as `Blob` by default and
   * `ArrayBuffer` when `binaryType` is set — both are handled.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: unknown = event.data;

      if (data instanceof ArrayBuffer) {
        this.processEventStreamFrame(data);
        return;
      }

      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        data
          .arrayBuffer()
          .then((buffer) => this.processEventStreamFrame(buffer))
          .catch((error) => {
            this.logger.error('Error reading Transcribe binary frame', error);
          });
        return;
      }

      this.logger.warn('Received unexpected non-binary message from Transcribe, ignoring');
    } catch (error) {
      this.logger.error('Error processing Transcribe WebSocket message', error);
    }
  }

  /**
   * Decode one event-stream frame and route it by `:message-type`.
   *
   * @internal
   */
  private processEventStreamFrame(buffer: ArrayBuffer): void {
    try {
      const message = decodeEventStreamMessage(buffer);
      const messageType = message.headers[':message-type'];

      if (messageType === 'event') {
        const eventType = message.headers[':event-type'];
        if (eventType === 'TranscriptEvent') {
          const body = JSON.parse(
            new TextDecoder().decode(message.payload)
          ) as TranscribeTranscriptEvent;
          this.handleTranscriptEvent(body);
        } else {
          this.logger.debug('Ignoring Transcribe event', { eventType });
        }
        return;
      }

      if (messageType === 'exception') {
        const exceptionType = String(message.headers[':exception-type'] ?? 'UnknownException');
        let exceptionMessage = '';
        try {
          const body = JSON.parse(new TextDecoder().decode(message.payload)) as {
            Message?: string;
          };
          exceptionMessage = body.Message ?? '';
        } catch {
          exceptionMessage = new TextDecoder().decode(message.payload);
        }
        this.logger.error('Transcribe exception', {
          exceptionType,
          exceptionMessage,
        });
        this.emitTranscription({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: exceptionMessage,
            errorType: exceptionType,
          },
        });
        return;
      }

      this.logger.warn('Unknown Transcribe message type', { messageType });
    } catch (error) {
      this.logger.error('Error decoding Transcribe event-stream frame', error);
    }
  }

  /**
   * Map Transcribe result segments to SDK transcription results.
   *
   * @remarks
   * `IsPartial: true` segments become interim results. An `IsPartial: false`
   * segment is a completed utterance segment — Transcribe only finalizes a
   * segment when it detects the speaker pausing, so the final result is
   * emitted with `utteranceComplete: true` to trigger the next pipeline
   * stage.
   *
   * @internal
   */
  private handleTranscriptEvent(event: TranscribeTranscriptEvent): void {
    for (const result of event.Transcript?.Results ?? []) {
      const alternative = result.Alternatives?.[0];
      const text = alternative?.Transcript?.trim() ?? '';
      if (!text) continue;

      if (result.IsPartial) {
        if (this.config.interimResults !== false) {
          this.emitTranscription({
            text,
            isFinal: false,
            metadata: {
              resultId: result.ResultId,
              startTime: result.StartTime,
              endTime: result.EndTime,
            },
          });
        }
        continue;
      }

      // Word-level confidence: average the confidence of pronunciation items.
      const items = alternative?.Items ?? [];
      let confidenceSum = 0;
      let confidenceCount = 0;
      for (const item of items) {
        if (item.Confidence != null) {
          confidenceSum += item.Confidence;
          confidenceCount += 1;
        }
      }

      this.emitTranscription({
        text,
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
        ...(confidenceCount > 0 ? { confidence: confidenceSum / confidenceCount } : {}),
        metadata: {
          // Word items with timing, plus Speaker labels when
          // showSpeakerLabel is enabled.
          items,
          resultId: result.ResultId,
          startTime: result.StartTime,
          endTime: result.EndTime,
          ...(result.LanguageCode ? { languageCode: result.LanguageCode } : {}),
        },
      });
    }
  }

  /**
   * Send a raw audio chunk to Transcribe as an event-stream `AudioEvent`.
   *
   * @remarks
   * The chunk is wrapped in a binary `application/vnd.amazon.eventstream`
   * message with `:message-type: 'event'`, `:event-type: 'AudioEvent'`,
   * and `:content-type: 'application/octet-stream'` headers. If the
   * connection is not open, the chunk is silently dropped and a warning is
   * logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      const frame = encodeEventStreamMessage(
        {
          ':message-type': 'event',
          ':event-type': 'AudioEvent',
          ':content-type': 'application/octet-stream',
        },
        new Uint8Array(chunk)
      );
      this.wsManager.send(frame.buffer as ArrayBuffer);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Gracefully close the Transcribe WebSocket connection.
   *
   * @remarks
   * Sends an empty `AudioEvent` frame to signal end-of-stream (Transcribe
   * finalizes pending segments and closes the session), then disconnects
   * the underlying {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Transcribe STT');
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
      this.logger.debug('Disconnecting from Transcribe streaming WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Empty AudioEvent signals end-of-stream to Transcribe.
      try {
        const endFrame = encodeEventStreamMessage(
          {
            ':message-type': 'event',
            ':event-type': 'AudioEvent',
            ':content-type': 'application/octet-stream',
          },
          new Uint8Array(0)
        );
        this.wsManager.send(endFrame.buffer as ArrayBuffer);
      } catch {
        // Ignore send errors during disconnect
      }

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from Transcribe streaming WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Transcribe STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Transcribe WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
