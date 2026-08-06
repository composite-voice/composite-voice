/**
 * Microsoft Azure Speech real-time speech-to-text provider using the
 * Speech service WebSocket API.
 *
 * @remarks
 * Implements the same wire protocol as the official
 * `microsoft-cognitiveservices-speech-sdk` JavaScript package:
 *
 * - **Text messages** are a header block (`Path:`, `X-RequestId:`,
 *   `X-Timestamp:`, `Content-Type:`) followed by `\r\n\r\n` and a JSON body.
 * - **Binary audio messages** are a 2-byte big-endian header-length prefix,
 *   the same header block (with `Path: audio`), and the raw audio bytes.
 *
 * No SDK dependency required.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Azure Speech recognition modes.
 *
 * @remarks
 * Selects the endpoint path `/speech/recognition/<mode>/cognitiveservices/v1`:
 *
 * - `'conversation'` -- continuous conversational speech (default; best for
 *   voice agents)
 * - `'interactive'` -- short commands/queries with aggressive end-of-speech
 *   detection
 * - `'dictation'` -- long-form dictation with spoken punctuation
 */
export type AzureSTTRecognitionMode = 'conversation' | 'interactive' | 'dictation';

/**
 * Configuration options for the {@link AzureSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Azure-specific settings. You must
 * provide **either** `apiKey` (for direct browser-to-Azure connections) or
 * `proxyUrl` (for a server-side proxy that injects the key). If both are
 * provided, `proxyUrl` takes precedence. In direct mode, `region` is
 * required.
 *
 * Browsers cannot set WebSocket headers, so in direct mode the credential
 * travels as a query parameter (as the official Azure JS SDK does): a string
 * `apiKey` is sent as `Ocp-Apim-Subscription-Key=<key>`, while an async
 * `apiKey` factory is assumed to return a short-lived bearer token (from
 * Azure's `POST https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken`)
 * and is sent as `Authorization=Bearer <token>`. Set `authType` explicitly
 * to override either default.
 *
 * @example
 * ```ts
 * // Direct connection with a server-issued 10-minute token
 * const config: AzureSTTConfig = {
 *   region: 'eastus',
 *   apiKey: async () => {
 *     const res = await fetch('/api/azure-speech-token');
 *     const { token } = await res.json();
 *     return token;
 *   },
 * };
 *
 * // Proxy connection (recommended for production)
 * const proxyConfig: AzureSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/azure-stt',
 *   language: 'en-US',
 * };
 * ```
 *
 * @see {@link AzureSTT} for the provider class
 */
export interface AzureSTTConfig extends STTProviderConfig {
  /**
   * Azure region of your Speech resource (e.g. `'eastus'`, `'westeurope'`).
   *
   * @remarks
   * Required in direct mode (ignored when `proxyUrl` or `endpoint` is set).
   * Selects the `wss://<region>.stt.speech.microsoft.com` endpoint.
   */
  region?: string;

  /**
   * Recognition mode, which selects the endpoint path.
   *
   * @defaultValue `'conversation'`
   * @see {@link AzureSTTRecognitionMode}
   */
  recognitionMode?: AzureSTTRecognitionMode;

  /**
   * Result detail level, sent as the `format` query parameter.
   *
   * @remarks
   * `'simple'` returns `DisplayText` only; `'detailed'` adds an `NBest`
   * list with per-alternative confidence and lexical/ITN forms.
   *
   * @defaultValue `'simple'`
   */
  outputFormat?: 'simple' | 'detailed';

  /**
   * Profanity handling, sent as the `profanity` query parameter.
   * One of `'masked'` (service default), `'removed'`, or `'raw'`.
   */
  profanity?: 'masked' | 'removed' | 'raw';

  /**
   * Audio sample rate in Hz of the streamed PCM audio.
   * @default 16000
   */
  sampleRate?: number;

  /**
   * Number of audio channels.
   * @default 1
   */
  numChannels?: number;

  /**
   * Bits per PCM sample.
   * @default 16
   */
  bitsPerSample?: number;

  /**
   * Additional `speech.context` payload merged into the context message
   * sent at the start of every turn (advanced; see the Speech service
   * protocol documentation).
   */
  context?: Record<string, unknown>;
}

/**
 * Shape of an Azure `speech.hypothesis` / `speech.fragment` message body.
 * @internal
 */
interface AzureSpeechHypothesis {
  Text?: string;
  Offset?: number;
  Duration?: number;
  PrimaryLanguage?: { Language?: string };
}

/**
 * Shape of an Azure `speech.phrase` message body.
 * @internal
 */
interface AzureSpeechPhrase {
  RecognitionStatus?: string;
  DisplayText?: string;
  Offset?: number;
  Duration?: number;
  PrimaryLanguage?: { Language?: string };
  /** Present when `outputFormat` is `'detailed'`. */
  NBest?: Array<{
    Confidence?: number;
    Lexical?: string;
    ITN?: string;
    MaskedITN?: string;
    Display?: string;
  }>;
}

/** @internal CRLF sequence used by the Speech service message framing. */
const CRLF = '\r\n';

/**
 * Generate a request/connection id in Azure's expected format:
 * 32 hex characters, no dashes.
 *
 * @internal
 */
function createRequestId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/**
 * Microsoft Azure Speech real-time STT provider using a raw WebSocket.
 *
 * @remarks
 * `AzureSTT` extends {@link LiveSTTProvider} and connects to the Azure
 * Speech service real-time recognition endpoint
 * (`wss://<region>.stt.speech.microsoft.com/speech/recognition/<mode>/cognitiveservices/v1`),
 * speaking the same framed-message protocol as the official
 * `microsoft-cognitiveservices-speech-sdk` package.
 *
 * After the socket opens, the provider sends a `speech.config` message
 * (client system/OS context), a `speech.context` message, and a binary
 * `audio` message carrying a 44-byte WAV/RIFF header describing the PCM
 * stream. Audio chunks are then wrapped in binary `audio` messages (2-byte
 * big-endian header-length prefix + headers + payload).
 *
 * The service replies over a turn lifecycle:
 *
 * ```
 * turn.start -> speech.startDetected -> speech.hypothesis* (interim)
 *   -> speech.phrase (final) -> speech.endDetected -> turn.end
 * ```
 *
 * `speech.hypothesis` messages are emitted as interim results;
 * `speech.phrase` with `RecognitionStatus: "Success"` is emitted with
 * `isFinal: true` and `utteranceComplete: true` (the phrase marks the end
 * of the detected utterance), triggering the next pipeline stage. After
 * `turn.end` the provider automatically starts a new turn — a fresh
 * `X-RequestId` plus new `speech.context` and WAV-header messages — for
 * continuous recognition.
 *
 * Key features:
 *
 * - Interim (hypothesis) and final (phrase) transcription results
 * - Service-side end-of-utterance detection for automatic turn-taking
 * - `simple` and `detailed` (NBest + confidence) output formats
 * - Continuous recognition across turns on a single connection
 * - Query-parameter auth for browsers (subscription key or bearer token)
 * - Proxy mode via {@link AzureSTTConfig.proxyUrl} (recommended for
 *   production so credentials stay server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> framed audio messages -> Azure WS
 *                                                                                |
 * CompositeVoice <- onTranscription(result) <- hypothesis/phrase parsing <-------+
 * ```
 *
 * @example
 * ```ts
 * import { AzureSTT } from 'composite-voice';
 *
 * const stt = new AzureSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/azure-stt',
 *   language: 'en-US',
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
 * // ... send 16 kHz 16-bit mono PCM chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link AzureSTTConfig} for configuration options
 * @see {@link AzureTTS} for the companion Azure TTS provider
 */
export class AzureSTT extends LiveSTTProvider {
  declare public config: AzureSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** The `X-RequestId` for the current turn (32 hex chars, no dashes). */
  private requestId = '';

  /** Whether a graceful disconnect is in progress (suppresses turn renewal). */
  private isStopping = false;

  /** Resolves the pending disconnect wait when `turn.end` arrives. */
  private turnEndResolver: (() => void) | null = null;

  /**
   * Create a new AzureSTT provider.
   *
   * @param config - Azure STT configuration. Must include either `apiKey`
   *   (plus `region`) or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new AzureSTT({
   *   apiKey: 'your-speech-resource-key',
   *   region: 'eastus',
   *   language: 'en-US',
   * });
   * ```
   */
  constructor(config: AzureSTTConfig, logger?: Logger) {
    const finalConfig: AzureSTTConfig = {
      language: 'en-US',
      recognitionMode: 'conversation',
      outputFormat: 'simple',
      sampleRate: 16000,
      numChannels: 1,
      bitsPerSample: 16,
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate authentication and region configuration.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is set, or when direct mode
   * is used without `region` or `endpoint`.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'AzureSTT',
        new Error('AzureSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.isProxyMode && !this.config.region && !this.config.endpoint) {
      throw new ProviderInitializationError(
        'AzureSTT',
        new Error('AzureSTT requires "region" (e.g. "eastus") in direct mode.')
      );
    }

    this.logger.info('Azure STT initialized', {
      region: this.config.region,
      recognitionMode: this.config.recognitionMode,
      language: this.config.language,
      outputFormat: this.config.outputFormat,
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
    this.logger.info('Azure STT disposed');
  }

  /**
   * Build the WebSocket URL for Azure real-time recognition.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/speech/recognition/<mode>/cognitiveservices/v1?...`
   * (the proxy strips its provider segment and injects the
   * `Ocp-Apim-Subscription-Key` header upstream).
   *
   * Direct mode: `wss://<region>.stt.speech.microsoft.com/speech/recognition/<mode>/cognitiveservices/v1?...`
   * with the credential appended as a query parameter, because browsers
   * cannot set WebSocket headers (this mirrors the official Azure JS SDK,
   * which folds its auth headers into the query string):
   *
   * - string `apiKey` -> `Ocp-Apim-Subscription-Key=<key>`
   * - `apiKey` factory (bearer token) -> `Authorization=Bearer <token>`
   *
   * A per-connection `X-ConnectionId` (32-hex GUID) is also appended in
   * direct mode, as the SDK does.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private async buildWebSocketUrl(): Promise<string> {
    const mode = this.config.recognitionMode ?? 'conversation';
    const path = `/speech/recognition/${mode}/cognitiveservices/v1`;

    const defaultUrl = this.config.region
      ? `wss://${this.config.region}.stt.speech.microsoft.com`
      : undefined;
    const base = this.resolveBaseUrl(defaultUrl);
    if (!base) throw new Error('Azure STT base URL could not be resolved');

    const params: string[] = [
      `language=${encodeURIComponent(this.config.language ?? 'en-US')}`,
      `format=${encodeURIComponent(this.config.outputFormat ?? 'simple')}`,
    ];

    if (this.config.profanity) {
      params.push(`profanity=${encodeURIComponent(this.config.profanity)}`);
    }

    if (!this.isProxyMode) {
      params.push(`X-ConnectionId=${createRequestId()}`);

      const key = await this.resolveApiKey();
      const useBearer =
        this.config.authType === 'bearer' ||
        (this.config.authType == null && typeof this.config.apiKey === 'function');
      if (useBearer) {
        params.push(`Authorization=${encodeURIComponent(`Bearer ${key}`)}`);
      } else {
        params.push(`Ocp-Apim-Subscription-Key=${encodeURIComponent(key)}`);
      }
    }

    return `${base}${path}?${params.join('&')}`;
  }

  /**
   * Serialize a protocol text message: header block + `\r\n\r\n` + body.
   *
   * @internal
   */
  private buildTextMessage(path: string, body: string): string {
    return (
      `Path: ${path}${CRLF}` +
      `X-RequestId: ${this.requestId}${CRLF}` +
      `X-Timestamp: ${new Date().toISOString()}${CRLF}` +
      `Content-Type: application/json${CRLF}` +
      CRLF +
      body
    );
  }

  /**
   * Serialize a binary audio message: 2-byte big-endian header-length
   * prefix + header block + raw audio bytes.
   *
   * @param chunk - The audio payload, or `null`/empty for the zero-length
   *   end-of-stream message.
   * @param contentType - Optional `Content-Type` header (the WAV header
   *   message uses `audio/x-wav`; plain chunks omit it).
   *
   * @internal
   */
  private buildAudioMessage(chunk: ArrayBuffer | null, contentType?: string): ArrayBuffer {
    let headers =
      `Path: audio${CRLF}` +
      `X-RequestId: ${this.requestId}${CRLF}` +
      `X-Timestamp: ${new Date().toISOString()}${CRLF}`;
    if (contentType) {
      headers += `Content-Type: ${contentType}${CRLF}`;
    }

    const headerBytes = new TextEncoder().encode(headers);
    const bodyLength = chunk ? chunk.byteLength : 0;
    const message = new Uint8Array(2 + headerBytes.byteLength + bodyLength);

    // 2-byte big-endian header length prefix
    message[0] = (headerBytes.byteLength >> 8) & 0xff;
    message[1] = headerBytes.byteLength & 0xff;
    message.set(headerBytes, 2);
    if (chunk && bodyLength > 0) {
      message.set(new Uint8Array(chunk), 2 + headerBytes.byteLength);
    }

    return message.buffer;
  }

  /**
   * Build the `speech.config` JSON body (client system/OS context).
   *
   * @internal
   */
  private buildSpeechConfigBody(): string {
    const isBrowser = typeof navigator !== 'undefined';
    return JSON.stringify({
      context: {
        system: {
          name: 'composite-voice',
          version: '1.0.0',
          build: 'JavaScript',
          lang: 'JavaScript',
        },
        os: {
          platform: isBrowser ? 'Browser' : 'Node',
          name: isBrowser ? navigator.userAgent : 'Node.js',
          version: isBrowser
            ? navigator.userAgent
            : typeof process !== 'undefined'
              ? process.version
              : 'unknown',
        },
      },
    });
  }

  /**
   * Build a 44-byte WAV/RIFF header describing the PCM stream.
   *
   * @remarks
   * The Speech service expects the first binary audio message of each turn
   * to carry a RIFF header (with zero-length size fields, exactly as the
   * official SDK sends it) so it can detect the sample rate, channel count,
   * and bit depth of subsequent raw PCM chunks.
   *
   * @internal
   */
  private buildWavHeader(): ArrayBuffer {
    const sampleRate = this.config.sampleRate ?? 16000;
    const channels = this.config.numChannels ?? 1;
    const bitsPerSample = this.config.bitsPerSample ?? 16;
    const blockAlign = channels * (bitsPerSample / 8);
    const avgBytesPerSec = sampleRate * blockAlign;

    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const writeString = (offset: number, str: string): void => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 0, true); // file length (unknown for streams)
    writeString(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); // fmt chunk length
    view.setUint16(20, 1, true); // PCM format tag
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, avgBytesPerSec, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, 0, true); // data length (unknown for streams)

    return buffer;
  }

  /**
   * Start a recognition turn: send `speech.context` followed by the binary
   * WAV header message under the current `X-RequestId`.
   *
   * @internal
   */
  private sendTurnStartMessages(): void {
    if (!this.wsManager) return;

    const contextBody = JSON.stringify(this.config.context ?? {});
    this.wsManager.send(this.buildTextMessage('speech.context', contextBody));
    this.wsManager.send(this.buildAudioMessage(this.buildWavHeader(), 'audio/x-wav'));
  }

  /**
   * Open a WebSocket connection to the Azure Speech service and start the
   * first recognition turn.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection enabled, waits for
   * the connection to open, then sends `speech.config`, `speech.context`,
   * and the WAV header message. The connection timeout defaults to
   * {@link AzureSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Azure STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Azure STT WebSocket');

      const wsUrl = await this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: reopening the socket cannot replay the
        // speech.config / turn.start handshake, so a reconnected socket would
        // be a dead session. Unexpected closes surface immediately via
        // onConnectionLost; the SDK (or a FallbackSTT chain) owns recovery.
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('Azure STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Azure STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Azure STT connection lost: ${error.message}`);
        },
      });

      await this.wsManager.connect();

      // Start the session: speech.config, then the first turn
      this.requestId = createRequestId();
      this.isStopping = false;
      this.wsManager.send(this.buildTextMessage('speech.config', this.buildSpeechConfigBody()));
      this.sendTurnStartMessages();

      this.isConnected = true;

      this.logger.info('Connected to Azure STT WebSocket', {
        recognitionMode: this.config.recognitionMode,
        language: this.config.language,
        outputFormat: this.config.outputFormat,
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
      throw new ProviderConnectionError('AzureSTT', error as Error);
    }
  }

  /**
   * Parse and dispatch incoming WebSocket messages from the Speech service.
   *
   * @remarks
   * Server messages are text frames with a header block, `\r\n\r\n`, and a
   * JSON body. `speech.hypothesis` (and dictation-mode `speech.fragment`)
   * messages produce interim results; `speech.phrase` messages with
   * `RecognitionStatus: "Success"` produce final results with
   * `utteranceComplete: true`. On `turn.end`, a new turn is started
   * automatically (fresh `X-RequestId`, `speech.context`, WAV header) for
   * continuous recognition.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-text message from Azure STT, ignoring');
        return;
      }

      const separatorIndex = event.data.indexOf(`${CRLF}${CRLF}`);
      const headerBlock = separatorIndex === -1 ? event.data : event.data.slice(0, separatorIndex);
      const body = separatorIndex === -1 ? '' : event.data.slice(separatorIndex + 4);

      let path = '';
      for (const line of headerBlock.split(CRLF)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx <= 0) continue;
        if (line.slice(0, colonIdx).trim().toLowerCase() === 'path') {
          path = line
            .slice(colonIdx + 1)
            .trim()
            .toLowerCase();
        }
      }

      switch (path) {
        case 'turn.start':
          this.logger.debug('Azure STT turn started', { requestId: this.requestId });
          break;

        case 'speech.startdetected':
          this.logger.debug('Azure STT speech start detected');
          break;

        case 'speech.hypothesis':
        case 'speech.fragment':
          this.handleHypothesis(body);
          break;

        case 'speech.phrase':
          this.handlePhrase(body);
          break;

        case 'speech.enddetected':
          this.logger.debug('Azure STT speech end detected');
          break;

        case 'turn.end':
          this.handleTurnEnd();
          break;

        default:
          this.logger.debug('Unhandled Azure STT message', { path });
      }
    } catch (error) {
      this.logger.error('Error processing Azure STT WebSocket message', error);
    }
  }

  /** Emit an interim result for a `speech.hypothesis` body. @internal */
  private handleHypothesis(body: string): void {
    if (this.config.interimResults === false) return;

    const hypothesis: AzureSpeechHypothesis = JSON.parse(body || '{}');
    const text = hypothesis.Text ?? '';
    if (!text) return;

    this.emitTranscription({
      text,
      isFinal: false,
      metadata: {
        offset: hypothesis.Offset,
        duration: hypothesis.Duration,
      },
    });
  }

  /**
   * Emit a final result for a `speech.phrase` body.
   *
   * @remarks
   * `RecognitionStatus: "Success"` phrases mark the end of a detected
   * utterance (the service sends `speech.endDetected` alongside), so they
   * are emitted with `utteranceComplete: true` to trigger the pipeline's
   * turn-taking. `EndOfDictation` and no-speech statuses (`NoMatch`,
   * `InitialSilenceTimeout`, `BabbleTimeout`) are logged and skipped.
   *
   * @internal
   */
  private handlePhrase(body: string): void {
    const phrase: AzureSpeechPhrase = JSON.parse(body || '{}');
    const status = phrase.RecognitionStatus ?? '';

    if (status !== 'Success') {
      this.logger.debug('Azure STT phrase without recognized speech', { status });
      return;
    }

    const best = phrase.NBest?.[0];
    const text = (phrase.DisplayText ?? best?.Display ?? '').trim();
    if (!text) return;

    this.emitTranscription({
      text,
      isFinal: true,
      speechFinal: true,
      utteranceComplete: true,
      ...(best?.Confidence != null ? { confidence: best.Confidence } : {}),
      metadata: {
        recognitionStatus: status,
        offset: phrase.Offset,
        duration: phrase.Duration,
        ...(phrase.PrimaryLanguage?.Language ? { language: phrase.PrimaryLanguage.Language } : {}),
        ...(phrase.NBest ? { nBest: phrase.NBest } : {}),
      },
    });
  }

  /**
   * Handle `turn.end`: resolve any pending disconnect wait, and — unless a
   * disconnect is in progress — start the next recognition turn with a
   * fresh `X-RequestId` (as the official SDK does for continuous
   * recognition).
   *
   * @internal
   */
  private handleTurnEnd(): void {
    this.logger.debug('Azure STT turn ended', { requestId: this.requestId });

    if (this.turnEndResolver) {
      this.turnEndResolver();
      return;
    }

    if (this.isStopping || !this.isConnected || !this.wsManager) return;

    try {
      this.requestId = createRequestId();
      this.sendTurnStartMessages();
    } catch (error) {
      this.logger.error('Failed to start new Azure STT turn', error);
    }
  }

  /**
   * Send a raw PCM audio chunk to the Speech service.
   *
   * @remarks
   * The chunk is wrapped in the binary `audio` message framing (2-byte
   * big-endian header-length prefix + headers + payload). Audio must match
   * the configured PCM parameters (default 16 kHz, 16-bit, mono). If the
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
      this.wsManager.send(this.buildAudioMessage(chunk));
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Gracefully close the Azure STT WebSocket connection.
   *
   * @remarks
   * Sends a zero-length binary `audio` message to signal end-of-stream (the
   * service finalizes the current turn and responds with `turn.end`), waits
   * for that `turn.end` (up to 1 s), then disconnects the underlying
   * {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Azure STT');
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
      this.logger.debug('Disconnecting from Azure STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();
      this.isStopping = true;

      // Zero-length audio message signals end-of-stream
      try {
        this.wsManager.send(this.buildAudioMessage(null));
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for the final turn.end (with a 1s fallback), then disconnect
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.turnEndResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 1000);
        this.turnEndResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from Azure STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Azure STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Azure STT WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
