/**
 * ElevenLabs TTS provider using WebSocket streaming API.
 *
 * @remarks
 * This module provides a WebSocket-based real-time streaming text-to-speech provider
 * powered by ElevenLabs voice models. Text chunks are sent over a persistent WebSocket
 * connection and audio chunks (PCM, MP3, or mu-law) are received incrementally for
 * low-latency speech output.
 *
 * Transport: WebSocket (direct to ElevenLabs or via proxy)
 * Audio format: Configurable (PCM 16-bit at various sample rates, MP3, mu-law);
 * default is `pcm_16000` (16-bit PCM at 16 kHz)
 *
 * @packageDocumentation
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * ElevenLabs voice model identifiers.
 *
 * @remarks
 * ElevenLabs offers several model tiers with different quality and latency characteristics:
 * - `eleven_turbo_v2_5` -- Latest turbo model, optimized for low latency
 * - `eleven_turbo_v2` -- Previous-generation turbo model
 * - `eleven_multilingual_v2` -- Supports multiple languages with high quality
 * - `eleven_monolingual_v1` -- English-only, legacy model
 *
 * Custom model IDs are also accepted via the `string & {}` type widening.
 */
export type ElevenLabsTTSModel =
  | 'eleven_turbo_v2_5'
  | 'eleven_turbo_v2'
  | 'eleven_multilingual_v2'
  | 'eleven_monolingual_v1'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * ElevenLabs output format identifiers.
 *
 * @remarks
 * The format string encodes both the encoding type and sample rate:
 * - `pcm_16000` -- 16-bit PCM at 16 kHz
 * - `pcm_22050` -- 16-bit PCM at 22.05 kHz
 * - `pcm_24000` -- 16-bit PCM at 24 kHz
 * - `pcm_44100` -- 16-bit PCM at 44.1 kHz
 * - `mp3_44100_128` -- MP3 at 44.1 kHz, 128 kbps
 * - `ulaw_8000` -- mu-law at 8 kHz (telephony)
 *
 * Custom format strings are also accepted via the `string & {}` type widening.
 */
export type ElevenLabsOutputFormat =
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'mp3_44100_128'
  | 'ulaw_8000'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Configuration for the {@link ElevenLabsTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: ElevenLabsTTSConfig = {
 *   apiKey: 'el-xxxxxxxxxxxx',
 *   voiceId: '21m00Tcm4TlvDq8ikWAM',
 *   modelId: 'eleven_turbo_v2_5',
 *   stability: 0.5,
 *   similarityBoost: 0.75,
 *   outputFormat: 'pcm_24000',
 * };
 *
 * // Via proxy server
 * const proxyConfig: ElevenLabsTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/elevenlabs',
 *   voiceId: '21m00Tcm4TlvDq8ikWAM',
 * };
 * ```
 *
 * @see {@link ElevenLabsTTSModel} - Available model options.
 * @see {@link ElevenLabsOutputFormat} - Available output format options.
 */
export interface ElevenLabsTTSConfig extends TTSProviderConfig {
  /**
   * ElevenLabs API key for direct authentication.
   *
   * @remarks
   * Required when connecting directly to ElevenLabs (no proxy).
   * Omit when using `proxyUrl` -- the proxy server supplies the key server-side.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's ElevenLabs endpoint.
   *
   * @remarks
   * When set, the WebSocket connection is routed through the proxy and the
   * `apiKey` is not required on the client side. The HTTP URL is automatically
   * converted to a WebSocket URL (`ws://` or `wss://`).
   *
   * @example `'http://localhost:3001/api/proxy/elevenlabs'`
   */
  proxyUrl?: string;

  /**
   * ElevenLabs voice ID (required).
   *
   * @remarks
   * Find voice IDs via the {@link https://elevenlabs.io/voice-library | ElevenLabs Voice Library}
   * or the API's list voices endpoint.
   */
  voiceId: string;

  /**
   * Model ID to use for synthesis.
   *
   * @defaultValue `'eleven_turbo_v2_5'`
   * @see {@link ElevenLabsTTSModel}
   */
  modelId?: ElevenLabsTTSModel;

  /**
   * Voice stability (0 to 1).
   *
   * @remarks
   * Higher values produce more consistent, predictable output.
   * Lower values introduce more variation and expressiveness.
   *
   * @defaultValue `0.5`
   */
  stability?: number;

  /**
   * Similarity boost (0 to 1).
   *
   * @remarks
   * Higher values make the synthesized voice more closely match the
   * original voice sample. Lower values allow more creative variation.
   *
   * @defaultValue `0.75`
   */
  similarityBoost?: number;

  /**
   * Output audio format string that encodes both encoding and sample rate.
   *
   * @defaultValue `'pcm_16000'`
   * @see {@link ElevenLabsOutputFormat}
   */
  outputFormat?: ElevenLabsOutputFormat;
}

/**
 * Maps ElevenLabs output format strings to their corresponding sample rates in Hz.
 *
 * @internal
 */
const FORMAT_SAMPLE_RATES: Record<string, number> = {
  pcm_16000: 16000,
  pcm_22050: 22050,
  pcm_24000: 24000,
  pcm_44100: 44100,
  mp3_44100_128: 44100,
  ulaw_8000: 8000,
};

/**
 * Maps ElevenLabs output format strings to their corresponding SDK encoding types.
 *
 * @internal
 */
const FORMAT_ENCODINGS: Record<string, string> = {
  pcm_16000: 'linear16',
  pcm_22050: 'linear16',
  pcm_24000: 'linear16',
  pcm_44100: 'linear16',
  mp3_44100_128: 'mp3',
  ulaw_8000: 'mulaw',
};

/**
 * ElevenLabs TTS provider for real-time streaming text-to-speech via WebSocket.
 *
 * @remarks
 * This provider establishes a WebSocket connection to the ElevenLabs streaming
 * TTS API (or a proxy server). Text chunks are sent as JSON messages and audio
 * is received either as base64-encoded JSON or raw binary data. The provider
 * uses the ElevenLabs stream-input protocol with BOS (Beginning of Stream) and
 * EOS (End of Stream) messages.
 *
 * The lifecycle is:
 * 1. Construct with {@link ElevenLabsTTSConfig}
 * 2. Call `initialize()` to validate configuration
 * 3. Call `connect()` to open the WebSocket and send the BOS message
 * 4. Call `sendText()` to stream text for synthesis
 * 5. Call `finalize()` to send the EOS message and flush remaining audio
 * 6. Call `disconnect()` to close the WebSocket
 * 7. Call `dispose()` to release all resources
 *
 * Audio flow: `Text chunks -> WebSocket -> ElevenLabs -> Audio chunks -> onAudio callback`
 *
 * @example
 * ```typescript
 * import { ElevenLabsTTS } from 'composite-voice';
 *
 * const tts = new ElevenLabsTTS({
 *   apiKey: 'el-xxxxxxxxxxxx',
 *   voiceId: '21m00Tcm4TlvDq8ikWAM',
 *   modelId: 'eleven_turbo_v2_5',
 *   outputFormat: 'pcm_24000',
 * });
 *
 * await tts.initialize();
 * await tts.connect();
 *
 * tts.onAudio((chunk) => {
 *   // Process audio chunk
 * });
 *
 * tts.sendText('Hello, world!');
 * await tts.finalize();
 * await tts.disconnect();
 * ```
 *
 * @see {@link LiveTTSProvider} - The base class this provider extends.
 * @see {@link ElevenLabsTTSConfig} - Configuration options for this provider.
 * @see {@link WebSocketManager} - The WebSocket manager used for connection handling.
 */
export class ElevenLabsTTS extends LiveTTSProvider {
  declare public config: ElevenLabsTTSConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;

  /**
   * Creates a new ElevenLabsTTS provider instance.
   *
   * @param config - Configuration for the ElevenLabs TTS provider.
   *   The `voiceId` property is required.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new ElevenLabsTTS({
   *   apiKey: 'el-xxxxxxxxxxxx',
   *   voiceId: '21m00Tcm4TlvDq8ikWAM',
   * });
   * ```
   */
  constructor(config: ElevenLabsTTSConfig, logger?: Logger) {
    const outputFormat = config.outputFormat ?? 'pcm_16000';
    const finalConfig: ElevenLabsTTSConfig = {
      modelId: 'eleven_turbo_v2_5',
      stability: 0.5,
      similarityBoost: 0.75,
      outputFormat,
      sampleRate: FORMAT_SAMPLE_RATES[outputFormat] ?? 16000,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validates configuration and prepares the provider for connection.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'ElevenLabsTTS',
        new Error('ElevenLabsTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'ElevenLabsTTS',
        new Error('ElevenLabsTTS requires "voiceId" to be configured.')
      );
    }

    this.logger.info('ElevenLabs TTS initialized', {
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      outputFormat: this.config.outputFormat,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * Disposes the provider, disconnecting from the WebSocket and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.logger.info('ElevenLabs TTS disposed');
  }

  /**
   * Builds the WebSocket URL for the ElevenLabs streaming TTS endpoint.
   *
   * @remarks
   * When using a proxy, the HTTP URL is converted to a WebSocket URL.
   * For direct connections, the URL includes the voice ID, model ID,
   * and output format as query parameters.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    if (this.config.proxyUrl) {
      // Convert http(s) to ws(s) for proxy
      return this.config.proxyUrl.replace(/^http/, 'ws');
    }

    const voiceId = this.config.voiceId;
    const modelId = this.config.modelId ?? 'eleven_turbo_v2_5';
    const outputFormat = this.config.outputFormat ?? 'pcm_16000';

    return `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${modelId}&output_format=${outputFormat}`;
  }

  /**
   * Connects to the ElevenLabs WebSocket for real-time TTS streaming.
   *
   * @remarks
   * Establishes a WebSocket connection and sends the BOS (Beginning of Stream)
   * message, which includes voice settings (stability and similarity boost)
   * and the API key (when not using a proxy). Auto-reconnect is disabled for
   * TTS sessions since each session is typically short-lived.
   *
   * This method is idempotent -- calling it when already connected is a no-op.
   *
   * @throws {@link ProviderConnectionError} if the WebSocket connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to ElevenLabs TTS');
      return;
    }

    try {
      this.logger.debug('Connecting to ElevenLabs TTS WebSocket');

      const wsUrl = this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        reconnection: {
          enabled: false, // Disable auto-reconnect for TTS sessions
        },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Set up message handler for incoming audio/metadata
      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('ElevenLabs TTS WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('ElevenLabs TTS WebSocket error', error);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();
      this.isConnected = true;

      // Send initial configuration message (BOS - Beginning of Stream)
      const bosMessage = {
        text: ' ',
        voice_settings: {
          stability: this.config.stability ?? 0.5,
          similarity_boost: this.config.similarityBoost ?? 0.75,
        },
        xi_api_key: this.config.proxyUrl ? undefined : this.config.apiKey,
      };

      this.wsManager.send(JSON.stringify(bosMessage));

      this.logger.info('Connected to ElevenLabs TTS WebSocket', {
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
      });
    } catch (error) {
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('ElevenLabsTTS', error as Error);
    }
  }

  /**
   * Handles incoming WebSocket messages containing audio data or metadata.
   *
   * @remarks
   * ElevenLabs may send audio in several forms:
   * - Binary `ArrayBuffer` -- raw audio data
   * - `Blob` -- converted to `ArrayBuffer` asynchronously
   * - JSON string with `audio` field -- base64-encoded audio
   * - JSON string with `alignment` field -- metadata/timing information
   * - JSON string with `isFinal` field -- end-of-stream indicator
   *
   * @param event - The WebSocket `MessageEvent` to process.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Binary data = raw audio
      if (event.data instanceof ArrayBuffer) {
        this.processAudioData(event.data);
        return;
      }

      if (event.data instanceof Blob) {
        // Convert Blob to ArrayBuffer
        event.data.arrayBuffer().then((buffer) => {
          this.processAudioData(buffer);
        });
        return;
      }

      // String data = JSON message (metadata, alignment, errors)
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);

        // Audio data encoded as base64
        if (message.audio) {
          const binaryString = atob(message.audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.processAudioData(bytes.buffer);
        }

        // Alignment/metadata
        if (message.alignment) {
          this.emitMetadata({
            sampleRate: this.getSampleRate(),
            encoding: this.getEncoding(),
            channels: 1,
            bitDepth: 16,
            mimeType: `audio/${this.getEncoding()}`,
          });
        }

        // Final message indicator
        if (message.isFinal) {
          this.logger.debug('ElevenLabs TTS stream complete');
        }
      }
    } catch (error) {
      this.logger.error('Error processing WebSocket message', error);
    }
  }

  /**
   * Processes raw audio data and emits it as a typed {@link AudioChunk}.
   *
   * @param data - The raw audio data as an `ArrayBuffer`.
   */
  private processAudioData(data: ArrayBuffer): void {
    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      metadata: {
        sampleRate: this.getSampleRate(),
        encoding: this.getEncoding(),
        channels: 1,
        bitDepth: 16,
      },
    };

    this.emitAudio(chunk);
  }

  /**
   * Derives the sample rate from the configured output format.
   *
   * @returns The sample rate in Hz corresponding to the output format.
   */
  private getSampleRate(): number {
    const format = this.config.outputFormat ?? 'pcm_16000';
    return FORMAT_SAMPLE_RATES[format] ?? this.config.sampleRate ?? 16000;
  }

  /**
   * Derives the audio encoding type from the configured output format.
   *
   * @returns The SDK-compatible audio encoding string.
   */
  private getEncoding(): 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw' {
    const format = this.config.outputFormat ?? 'pcm_16000';
    return (FORMAT_ENCODINGS[format] ?? 'linear16') as
      | 'linear16'
      | 'opus'
      | 'mp3'
      | 'mulaw'
      | 'alaw';
  }

  /**
   * Sends a text chunk to ElevenLabs for real-time synthesis.
   *
   * @remarks
   * The text is wrapped in a JSON message with `try_trigger_generation: true`,
   * which instructs ElevenLabs to begin generating audio as soon as enough
   * text has been buffered. If not connected, the call is silently ignored
   * with a warning log.
   *
   * @param chunk - The text to synthesize into speech.
   */
  protected sendTextToSocket(chunk: string): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      const message = JSON.stringify({
        text: chunk,
        try_trigger_generation: true,
      });

      this.wsManager.send(message);
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalizes the current synthesis session by sending the EOS (End of Stream) message.
   *
   * @remarks
   * Sends an empty text message with `flush: true` to signal the end of input
   * and trigger generation of any remaining buffered audio. Waits up to 2 seconds
   * for final audio to arrive before resolving.
   *
   * @throws Rethrows any error that occurs during finalization.
   */
  protected async finalizeSocket(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing ElevenLabs TTS synthesis');

      // Send EOS (End of Stream) message
      const eosMessage = JSON.stringify({
        text: '',
        flush: true,
      });

      this.wsManager.send(eosMessage);

      // Wait for final audio to arrive (or timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000);

        // Listen for the final message from ElevenLabs
        const originalHandler = this.wsManager!.isConnected()
          ? () => {
              clearTimeout(timeout);
              resolve();
            }
          : null;

        // If connection closes, resolve immediately
        if (!this.wsManager?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        }

        // The timeout will handle the case where we don't get a clear signal
        if (originalHandler) {
          // Just wait for timeout - ElevenLabs doesn't have a clear "flushed" event
          // The audio data will arrive before the timeout
        }
      });

      this.logger.info('ElevenLabs TTS finalized');
    } catch (error) {
      this.logger.error('Error finalizing ElevenLabs TTS', error);
      throw error;
    }
  }

  /**
   * Disconnects from the ElevenLabs WebSocket.
   *
   * @remarks
   * Gracefully closes the WebSocket connection and releases the
   * {@link WebSocketManager} instance.
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Not connected to ElevenLabs TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from ElevenLabs TTS WebSocket');

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from ElevenLabs TTS WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from ElevenLabs TTS', error);
      throw error;
    }
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
