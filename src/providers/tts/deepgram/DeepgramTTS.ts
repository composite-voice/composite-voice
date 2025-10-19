/**
 * Deepgram TTS provider using the official Deepgram SDK
 * WebSocket-only provider for real-time streaming text-to-speech
 */

import { BaseTTSProvider } from '../../base/BaseTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type DeepgramClient = typeof import('@deepgram/sdk').createClient;
// Note: Using 'any' for LiveTTSClient as the type may not be exported in all SDK versions
type LiveTTSClient = any;

/**
 * Deepgram-specific TTS options
 */
export interface DeepgramTTSOptions {
  /** Model to use (e.g., 'aura-asteria-en', 'aura-luna-en', 'aura-stella-en', 'aura-athena-en', 'aura-hera-en', 'aura-orion-en', 'aura-arcas-en', 'aura-perseus-en', 'aura-angus-en', 'aura-orpheus-en', 'aura-helios-en', 'aura-zeus-en') */
  model?: string;
  /** Audio encoding format (e.g., 'linear16', 'mulaw', 'alaw') */
  encoding?: string;
  /** Sample rate for output audio (e.g., 8000, 16000, 24000, 48000) */
  sampleRate?: number;
  /** Container format (e.g., 'none', 'wav') */
  container?: string;
  /** Bit rate for encoded output */
  bitRate?: number;
}

/**
 * Deepgram TTS provider configuration
 */
export interface DeepgramTTSConfig extends TTSProviderConfig {
  /** Deepgram API key */
  apiKey: string;
  /** Deepgram TTS options */
  options?: DeepgramTTSOptions;
}

/**
 * Deepgram TTS provider
 * Real-time streaming text-to-speech via WebSocket
 */
export class DeepgramTTS extends BaseTTSProvider {
  declare public config: DeepgramTTSConfig;
  private deepgram: Awaited<ReturnType<DeepgramClient>> | null = null;
  private liveClient: LiveTTSClient | null = null;
  private isConnected = false;

  constructor(config: DeepgramTTSConfig, logger?: Logger) {
    const finalConfig = {
      voice: config.voice ?? 'aura-asteria-en',
      sampleRate: config.sampleRate ?? 16000,
      outputFormat: config.outputFormat ?? 'linear16',
      ...config,
    };
    super(finalConfig, logger);

    // Deepgram provider is always WebSocket mode
    (this as { type: 'rest' | 'websocket' }).type = 'websocket';
  }

  protected async onInitialize(): Promise<void> {
    try {
      // Dynamically import Deepgram SDK (peer dependency)
      const DeepgramModule = await import('@deepgram/sdk');
      const { createClient } = DeepgramModule;

      // Initialize Deepgram client
      this.deepgram = createClient(this.config.apiKey);

      this.logger.info('Deepgram TTS initialized (WebSocket mode)', {
        model: this.config.options?.model ?? this.config.voice,
        sampleRate: this.config.sampleRate,
        encoding: this.config.options?.encoding ?? this.config.outputFormat,
      });
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

  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.liveClient = null;
    this.deepgram = null;
    this.logger.info('Deepgram TTS disposed');
  }

  /**
   * Connect to Deepgram WebSocket for real-time TTS
   */
  override async connect(): Promise<void> {
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
        model: this.config.options?.model ?? this.config.voice ?? 'aura-asteria-en',
        encoding: this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16',
        sample_rate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 16000,
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
   * Setup event handlers for live TTS
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
            sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 16000,
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
          sampleRate: metadata.sample_rate ?? this.config.sampleRate ?? 16000,
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
   * Send text chunk for real-time synthesis
   * @param text Text to synthesize
   */
  override sendText(text: string): void {
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
   * Finalize synthesis and process remaining text
   */
  override async finalize(): Promise<void> {
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
   * Disconnect from Deepgram WebSocket
   */
  override async disconnect(): Promise<void> {
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
   * Check if currently connected (WebSocket mode)
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
