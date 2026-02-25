/**
 * Deepgram TTS provider using the official Deepgram SDK.
 *
 * @remarks
 * This module provides a WebSocket-based real-time streaming text-to-speech provider
 * powered by Deepgram's Aura voice models. Text chunks are sent over a persistent
 * WebSocket connection and audio chunks are received as raw PCM or encoded audio.
 *
 * Transport: WebSocket (via `@deepgram/sdk`)
 * Audio format: Configurable (linear16, mulaw, alaw); default is `linear16` at 24 kHz
 *
 * The `@deepgram/sdk` package is a peer dependency and must be installed separately.
 *
 * @packageDocumentation
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type DeepgramClient = typeof import('@deepgram/sdk').createClient;
// Note: Using unknown for LiveTTSClient as the type may not be exported in all SDK versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveTTSClient = any;

/**
 * Deepgram-specific TTS synthesis options.
 *
 * @remarks
 * These options map to the Deepgram TTS WebSocket API parameters. They are
 * passed as connection options when establishing the live TTS session.
 *
 * @see {@link https://developers.deepgram.com/docs/tts-websocket | Deepgram TTS WebSocket Docs}
 */
export interface DeepgramTTSOptions {
  /**
   * The Deepgram voice model to use for synthesis.
   *
   * @remarks
   * Aura 2 models (recommended): `'aura-2-thalia-en'`, `'aura-2-andromeda-en'`,
   * `'aura-2-janus-en'`, `'aura-2-proteus-en'`, `'aura-2-orion-en'`,
   * `'aura-2-luna-en'`, `'aura-2-arcas-en'`.
   *
   * Aura 1 models (legacy): `'aura-asteria-en'`, `'aura-luna-en'`, `'aura-stella-en'`.
   *
   * @defaultValue Falls back to `config.voice` or `'aura-2-thalia-en'`
   */
  model?: string;

  /**
   * Audio encoding format for the output audio.
   *
   * @defaultValue Falls back to `config.outputFormat` or `'linear16'`
   */
  encoding?: string;

  /**
   * Sample rate for the output audio in Hz.
   *
   * @defaultValue Falls back to `config.sampleRate` or `24000`
   */
  sampleRate?: number;

  /**
   * Container format for the output audio.
   *
   * @remarks
   * Use `'none'` for raw audio (typical for WebSocket streaming) or `'wav'`
   * for WAV-wrapped output.
   *
   * @defaultValue `'none'`
   */
  container?: string;

  /**
   * Bit rate for the encoded output audio, in bits per second.
   *
   * @remarks
   * Only applicable for certain encoding formats. Omit for PCM formats.
   *
   * @defaultValue `undefined`
   */
  bitRate?: number;
}

/**
 * Configuration for the {@link DeepgramTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: DeepgramTTSConfig = {
 *   apiKey: 'dg-xxxxxxxxxxxx',
 *   voice: 'aura-2-thalia-en',
 *   sampleRate: 24000,
 *   outputFormat: 'linear16',
 * };
 *
 * // Via proxy server
 * const proxyConfig: DeepgramTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   voice: 'aura-2-andromeda-en',
 * };
 * ```
 *
 * @see {@link DeepgramTTSOptions} - Additional Deepgram-specific synthesis options.
 */
export interface DeepgramTTSConfig extends TTSProviderConfig {
  /**
   * Deepgram API key for direct authentication.
   *
   * @remarks
   * Required when connecting directly to Deepgram (no proxy).
   * Omit when using `proxyUrl` -- the proxy server supplies the key server-side.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's Deepgram endpoint.
   *
   * @remarks
   * When set, the WebSocket connection is routed through the proxy and the
   * `apiKey` is not required on the client side.
   *
   * @example `'http://localhost:3001/api/proxy/deepgram'`
   */
  proxyUrl?: string;

  /**
   * Additional Deepgram-specific TTS options.
   *
   * @remarks
   * Options here override the top-level `voice`, `sampleRate`, and `outputFormat`
   * values when both are provided.
   *
   * @see {@link DeepgramTTSOptions}
   */
  options?: DeepgramTTSOptions;
}

/**
 * Deepgram TTS provider for real-time streaming text-to-speech via WebSocket.
 *
 * @remarks
 * This provider uses the official `@deepgram/sdk` to establish a persistent WebSocket
 * connection to Deepgram's TTS service. Text chunks are sent incrementally and audio
 * chunks are emitted as they arrive, enabling low-latency speech output.
 *
 * The lifecycle is:
 * 1. Construct with {@link DeepgramTTSConfig}
 * 2. Call `initialize()` to load the Deepgram SDK and create the client
 * 3. Call `connect()` to open the WebSocket connection
 * 4. Call `sendText()` to stream text for synthesis
 * 5. Call `finalize()` to flush remaining audio
 * 6. Call `disconnect()` to close the WebSocket
 * 7. Call `dispose()` to release all resources
 *
 * Audio flow: `Text chunks -> WebSocket -> Deepgram -> Audio chunks -> onAudio callback`
 *
 * @example
 * ```typescript
 * import { DeepgramTTS } from 'composite-voice';
 *
 * const tts = new DeepgramTTS({
 *   apiKey: 'dg-xxxxxxxxxxxx',
 *   voice: 'aura-2-thalia-en',
 *   sampleRate: 24000,
 *   outputFormat: 'linear16',
 * });
 *
 * await tts.initialize();
 * await tts.connect();
 *
 * tts.onAudio((chunk) => {
 *   // Process audio chunk (e.g., feed to AudioPlayer)
 * });
 *
 * tts.sendText('Hello, world!');
 * await tts.finalize();
 * await tts.disconnect();
 * ```
 *
 * @see {@link LiveTTSProvider} - The base class this provider extends.
 * @see {@link DeepgramTTSConfig} - Configuration options for this provider.
 */
export class DeepgramTTS extends LiveTTSProvider {
  declare public config: DeepgramTTSConfig;
  private deepgram: Awaited<ReturnType<DeepgramClient>> | null = null;
  private liveClient: LiveTTSClient | null = null;
  private isConnected = false;

  /**
   * Creates a new DeepgramTTS provider instance.
   *
   * @param config - Configuration for the Deepgram TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new DeepgramTTS({
   *   apiKey: 'dg-xxxxxxxxxxxx',
   *   voice: 'aura-2-thalia-en',
   * });
   * ```
   */
  constructor(config: DeepgramTTSConfig, logger?: Logger) {
    const finalConfig = {
      voice: config.voice ?? 'aura-2-thalia-en',
      sampleRate: config.sampleRate ?? 24000,
      outputFormat: config.outputFormat ?? 'linear16',
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Initializes the Deepgram client by dynamically importing the SDK.
   *
   * @remarks
   * The `@deepgram/sdk` is loaded dynamically as a peer dependency. If using
   * `proxyUrl`, the client is configured to route WebSocket traffic through
   * the proxy server. Otherwise, it connects directly using the `apiKey`.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if the `@deepgram/sdk` package is not installed.
   * @throws {@link ProviderInitializationError} if any other initialization error occurs.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'DeepgramTTS',
        new Error('DeepgramTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Deepgram SDK (peer dependency)
      const DeepgramModule = await import('@deepgram/sdk');
      const { createClient } = DeepgramModule;

      if (this.config.proxyUrl) {
        const wsUrl = this.config.proxyUrl.replace(/^http/, 'ws');
        this.deepgram = createClient('proxy', { global: { url: wsUrl } });
        this.logger.info('Deepgram TTS initialized (proxy mode)', { proxyUrl: wsUrl });
      } else {
        this.deepgram = createClient(this.config.apiKey as string);
        this.logger.info('Deepgram TTS initialized (WebSocket mode)', {
          model: this.config.options?.model ?? this.config.voice,
          sampleRate: this.config.sampleRate,
          encoding: this.config.options?.encoding ?? this.config.outputFormat,
        });
      }
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'DeepgramTTS',
          new Error(
            'Deepgram SDK not found. Install with: npm install @deepgram/sdk\n' +
              'The Deepgram SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('DeepgramTTS', error as Error);
    }
  }

  /**
   * Disposes the provider, disconnecting from the WebSocket and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.liveClient = null;
    this.deepgram = null;
    this.logger.info('Deepgram TTS disposed');
  }

  /**
   * Connects to the Deepgram WebSocket for real-time TTS streaming.
   *
   * @remarks
   * Establishes a live TTS connection using the configured model, encoding,
   * sample rate, and container format. The connection emits audio chunks
   * as Deepgram processes incoming text.
   *
   * This method is idempotent -- calling it when already connected is a no-op.
   *
   * @throws {@link ProviderConnectionError} if the Deepgram client is not initialized.
   * @throws {@link ProviderConnectionError} if the WebSocket connection fails or times out.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram TTS');
      return;
    }

    if (!this.deepgram) {
      throw new ProviderConnectionError(
        'DeepgramTTS',
        new Error('Deepgram client not initialized')
      );
    }

    try {
      this.logger.debug('Connecting to Deepgram TTS WebSocket');

      // Build connection options
      const options: Record<string, unknown> = {
        model: this.config.options?.model ?? this.config.voice ?? 'aura-2-thalia-en',
        encoding: this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16',
        sample_rate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
        container: this.config.options?.container ?? 'none',
      };

      // Add optional parameters
      if (this.config.options?.bitRate) {
        options.bit_rate = this.config.options.bitRate;
      }

      // Create live TTS connection
      this.liveClient = this.deepgram.speak.live(
        options as Parameters<typeof this.deepgram.speak.live>[0]
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout ?? 10000);

        this.liveClient?.on('Open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram TTS WebSocket');
          resolve();
        });

        this.liveClient?.on('Error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('Failed to connect to Deepgram TTS WebSocket', error);
          reject(error);
        });
      });
    } catch (error) {
      this.liveClient = null;
      throw new ProviderConnectionError('DeepgramTTS', error as Error);
    }
  }

  /**
   * Sets up event handlers on the live TTS client for audio data, metadata,
   * flush events, errors, warnings, and connection close.
   */
  private setupEventHandlers(): void {
    if (!this.liveClient) return;

    // Handle audio data
    this.liveClient.on('Audio', (data: unknown) => {
      try {
        // Deepgram sends raw audio bytes as ArrayBuffer or Buffer
        const audioData = data as ArrayBuffer | Buffer;

        // Convert Buffer to ArrayBuffer if needed
        let arrayBuffer: ArrayBuffer;
        if (audioData instanceof ArrayBuffer) {
          arrayBuffer = audioData;
        } else {
          // Handle Buffer type (Node.js Buffer or Buffer-like objects)
          const buffer = audioData as Buffer;
          // Create a new ArrayBuffer and copy the data
          arrayBuffer = new ArrayBuffer(buffer.byteLength);
          const view = new Uint8Array(arrayBuffer);
          view.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
        }

        // Create audio chunk
        const chunk: AudioChunk = {
          data: arrayBuffer,
          timestamp: Date.now(),
          metadata: {
            sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
            encoding: (this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16') as
              | 'linear16'
              | 'opus'
              | 'mp3'
              | 'mulaw'
              | 'alaw',
            channels: 1, // Deepgram TTS typically outputs mono
            bitDepth: 16,
          },
        };

        this.emitAudio(chunk);
      } catch (error) {
        this.logger.error('Error processing audio data', error);
      }
    });

    // Handle metadata events
    this.liveClient.on('Metadata', (data: unknown) => {
      this.logger.debug('Metadata received', data);

      // Extract metadata if available
      const metadata = data as {
        request_id?: string;
        model_name?: string;
        model_uuid?: string;
        characters?: number;
        transfer_encoding?: string;
        sample_rate?: number;
      };

      if (metadata) {
        this.emitMetadata({
          sampleRate: metadata.sample_rate ?? this.config.sampleRate ?? 24000,
          encoding: (this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16') as
            | 'linear16'
            | 'opus'
            | 'mp3'
            | 'mulaw'
            | 'alaw',
          channels: 1,
          bitDepth: 16,
          mimeType: `audio/${this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16'}`,
        });
      }
    });

    // Handle flush event (all audio has been sent)
    this.liveClient.on('Flushed', () => {
      this.logger.debug('Deepgram TTS flushed');
    });

    // Handle errors
    this.liveClient.on('Error', (error: Error) => {
      this.logger.error('Deepgram TTS WebSocket error', error);
    });

    // Handle warnings
    this.liveClient.on('Warning', (warning: unknown) => {
      this.logger.warn('Deepgram TTS WebSocket warning', warning);
    });

    // Handle close
    this.liveClient.on('Close', () => {
      this.logger.info('Deepgram TTS WebSocket closed');
      this.isConnected = false;
    });
  }

  /**
   * Sends a text chunk to Deepgram for real-time synthesis.
   *
   * @remarks
   * Text is sent over the open WebSocket connection. Deepgram processes the
   * text incrementally and emits audio chunks via the `onAudio` callback.
   * If not connected, the call is silently ignored with a warning log.
   *
   * @param text - The text to synthesize into speech.
   */
  sendText(text: string): void {
    if (!this.isConnected || !this.liveClient) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      // Send text to Deepgram
      this.liveClient.sendText(text);
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalizes the current synthesis session by flushing remaining audio.
   *
   * @remarks
   * Sends a flush command to Deepgram to ensure all buffered text has been
   * processed and all resulting audio has been emitted. Waits for the
   * `Flushed` event or a 1-second timeout before resolving.
   *
   * @throws Rethrows any error that occurs during finalization.
   */
  async finalize(): Promise<void> {
    if (!this.isConnected || !this.liveClient) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing Deepgram TTS synthesis');

      // Flush any remaining audio
      this.liveClient.flush();

      // Wait for flushed event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.liveClient?.on('Flushed', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.logger.info('Deepgram TTS finalized');
    } catch (error) {
      this.logger.error('Error finalizing Deepgram TTS', error);
      throw error;
    }
  }

  /**
   * Disconnects from the Deepgram WebSocket.
   *
   * @remarks
   * Flushes any remaining audio, sends a finish signal, and waits for
   * the WebSocket to close (with a 1-second timeout). After disconnection,
   * the live client reference is released.
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.liveClient) {
      this.logger.warn('Not connected to Deepgram TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram TTS WebSocket');

      // Flush and close the stream
      this.liveClient.flush();
      this.liveClient.finish();

      // Wait for close event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.liveClient?.on('Close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isConnected = false;
      this.liveClient = null;

      this.logger.info('Disconnected from Deepgram TTS WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram TTS', error);
      throw error;
    }
  }

  /**
   * Checks whether the WebSocket connection to Deepgram is currently active.
   *
   * @returns `true` if the WebSocket is connected, `false` otherwise.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
