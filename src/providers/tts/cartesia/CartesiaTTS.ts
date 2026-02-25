/**
 * Cartesia TTS provider using WebSocket streaming API
 * Low-latency real-time streaming text-to-speech via WebSocket
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import {
  WebSocketManager,
  type WebSocketManagerOptions,
} from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Cartesia model IDs
 */
export type CartesiaTTSModel =
  | 'sonic-2'
  | 'sonic'
  | 'sonic-multilingual'
  | (string & {});

/**
 * Cartesia output format encoding
 */
export type CartesiaOutputEncoding =
  | 'pcm_s16le'
  | 'pcm_f32le'
  | 'pcm_mulaw'
  | 'pcm_alaw'
  | (string & {});

/**
 * Cartesia output format configuration
 */
export interface CartesiaOutputFormat {
  /** Container format — always 'raw' for WebSocket streaming */
  container: 'raw';
  /** Audio encoding */
  encoding: CartesiaOutputEncoding;
  /** Sample rate in Hz */
  sample_rate: number;
}

/**
 * Cartesia TTS provider configuration.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 */
export interface CartesiaTTSConfig extends TTSProviderConfig {
  /**
   * Cartesia API key.
   * Required when connecting directly to Cartesia.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's Cartesia endpoint.
   * Example: `'http://localhost:3000/api/proxy/cartesia'`
   */
  proxyUrl?: string;
  /**
   * Cartesia voice ID (required).
   * Find voice IDs via the Cartesia voice library.
   */
  voiceId: string;
  /**
   * Model ID to use for synthesis.
   * @default 'sonic-2'
   */
  modelId?: CartesiaTTSModel;
  /**
   * Language code for synthesis.
   * @default 'en'
   */
  language?: string;
  /**
   * Output audio encoding format.
   * @default 'pcm_s16le'
   */
  outputEncoding?: CartesiaOutputEncoding;
  /**
   * Output audio sample rate in Hz.
   * @default 16000
   */
  outputSampleRate?: number;
  /**
   * Speech speed multiplier. Values > 1 speed up, < 1 slow down.
   */
  speed?: number;
  /**
   * Emotion controls for voice expression.
   * Array of emotion tags, e.g. ['positivity:high', 'curiosity']
   */
  emotion?: string[];
  /**
   * Cartesia API version string.
   * @default '2024-06-10'
   */
  cartesiaVersion?: string;
}

/** Map Cartesia encoding to SDK AudioEncoding */
const ENCODING_MAP: Record<string, 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw'> = {
  pcm_s16le: 'linear16',
  pcm_f32le: 'linear16',
  pcm_mulaw: 'mulaw',
  pcm_alaw: 'alaw',
};

/**
 * Cartesia TTS provider
 * Low-latency real-time streaming text-to-speech via WebSocket
 * CompositeVoice sends text chunks to this provider and receives audio chunks
 */
export class CartesiaTTS extends LiveTTSProvider {
  declare public config: CartesiaTTSConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;
  private contextId: string | null = null;
  private hasSentFirstChunk = false;

  constructor(config: CartesiaTTSConfig, logger?: Logger) {
    const finalConfig: CartesiaTTSConfig = {
      modelId: 'sonic-2',
      language: 'en',
      outputEncoding: 'pcm_s16le',
      outputSampleRate: 16000,
      cartesiaVersion: '2024-06-10',
      sampleRate: config.outputSampleRate ?? 16000,
      ...config,
    };
    super(finalConfig, logger);
  }

  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'CartesiaTTS',
        new Error('CartesiaTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'CartesiaTTS',
        new Error('CartesiaTTS requires "voiceId" to be configured.')
      );
    }

    this.logger.info('Cartesia TTS initialized', {
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      outputEncoding: this.config.outputEncoding,
      outputSampleRate: this.config.outputSampleRate,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.contextId = null;
    this.hasSentFirstChunk = false;
    this.logger.info('Cartesia TTS disposed');
  }

  /**
   * Build the WebSocket URL for Cartesia streaming TTS
   */
  private buildWebSocketUrl(): string {
    if (this.config.proxyUrl) {
      // Convert http(s) to ws(s) for proxy
      return this.config.proxyUrl.replace(/^http/, 'ws');
    }

    const version = this.config.cartesiaVersion ?? '2024-06-10';
    return `wss://api.cartesia.ai/tts/websocket?api_key=${this.config.apiKey}&cartesia_version=${version}`;
  }

  /**
   * Generate a random context ID for streaming continuation
   */
  private generateContextId(): string {
    // Simple UUID-like random ID
    const segments = [];
    for (let i = 0; i < 4; i++) {
      segments.push(Math.random().toString(36).substring(2, 10));
    }
    return segments.join('-');
  }

  /**
   * Connect to Cartesia WebSocket for real-time TTS
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Cartesia TTS');
      return;
    }

    try {
      this.logger.debug('Connecting to Cartesia TTS WebSocket');

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
          this.logger.info('Cartesia TTS WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Cartesia TTS WebSocket error', error);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();
      this.isConnected = true;

      // Generate a fresh context ID for this session
      this.contextId = this.generateContextId();
      this.hasSentFirstChunk = false;

      this.logger.info('Connected to Cartesia TTS WebSocket', {
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
        contextId: this.contextId,
      });
    } catch (error) {
      this.wsManager = null;
      this.isConnected = false;
      this.contextId = null;
      throw new ProviderConnectionError('CartesiaTTS', error as Error);
    }
  }

  /**
   * Handle incoming WebSocket messages (audio chunks and metadata)
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Binary data = raw audio (Cartesia can send raw PCM)
      if (event.data instanceof ArrayBuffer) {
        this.processAudioData(event.data);
        return;
      }

      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          this.processAudioData(buffer);
        });
        return;
      }

      // String data = JSON message
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);

        // Audio chunk with base64 data
        if (message.type === 'chunk' && message.data) {
          const binaryString = atob(message.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.processAudioData(bytes.buffer);
        }

        // Word-level timestamps
        if (message.type === 'timestamps' && message.word_timestamps) {
          this.emitMetadata({
            sampleRate: this.config.outputSampleRate ?? 16000,
            encoding: this.getEncoding(),
            channels: 1,
            bitDepth: 16,
            mimeType: `audio/${this.getEncoding()}`,
          });
        }

        // Stream done
        if (message.type === 'done' || (message.type === 'chunk' && message.done === true)) {
          this.logger.debug('Cartesia TTS stream complete');
        }

        // Error message
        if (message.type === 'error' || message.error) {
          this.logger.error('Cartesia TTS error', {
            error: message.error ?? message.message ?? message,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error processing WebSocket message', error);
    }
  }

  /**
   * Process raw audio data and emit as AudioChunk
   */
  private processAudioData(data: ArrayBuffer): void {
    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      metadata: {
        sampleRate: this.config.outputSampleRate ?? 16000,
        encoding: this.getEncoding(),
        channels: 1,
        bitDepth: 16,
      },
    };

    this.emitAudio(chunk);
  }

  /**
   * Get SDK audio encoding from Cartesia output encoding
   */
  private getEncoding(): 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw' {
    const encoding = this.config.outputEncoding ?? 'pcm_s16le';
    return ENCODING_MAP[encoding] ?? 'linear16';
  }

  /**
   * Build the output format object for Cartesia API
   */
  private buildOutputFormat(): CartesiaOutputFormat {
    return {
      container: 'raw',
      encoding: this.config.outputEncoding ?? 'pcm_s16le',
      sample_rate: this.config.outputSampleRate ?? 16000,
    };
  }

  /**
   * Send text chunk for real-time synthesis.
   * Uses context_id for streaming continuation across chunks.
   * @param chunk Text to synthesize
   */
  sendText(chunk: string): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message: Record<string, any> = {
        model_id: this.config.modelId ?? 'sonic-2',
        transcript: chunk,
        voice: {
          mode: 'id',
          id: this.config.voiceId,
        },
        output_format: this.buildOutputFormat(),
        context_id: this.contextId,
        continue: this.hasSentFirstChunk,
      };

      // Add optional parameters
      if (this.config.language) {
        message.language = this.config.language;
      }
      if (this.config.speed !== undefined) {
        message.speed = this.config.speed;
      }
      if (this.config.emotion) {
        message.emotion = this.config.emotion;
      }

      this.wsManager.send(JSON.stringify(message));

      // After the first chunk, subsequent chunks continue the context
      this.hasSentFirstChunk = true;
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalize synthesis — send end-of-input signal to flush remaining audio
   */
  async finalize(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing Cartesia TTS synthesis');

      // Send empty transcript with continue:false to signal end of input
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const endMessage: Record<string, any> = {
        model_id: this.config.modelId ?? 'sonic-2',
        transcript: '',
        voice: {
          mode: 'id',
          id: this.config.voiceId,
        },
        output_format: this.buildOutputFormat(),
        context_id: this.contextId,
        continue: false,
      };

      this.wsManager.send(JSON.stringify(endMessage));

      // Wait for final audio to arrive (or timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000);

        if (!this.wsManager?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        }
      });

      // Reset context for next utterance
      this.contextId = this.generateContextId();
      this.hasSentFirstChunk = false;

      this.logger.info('Cartesia TTS finalized');
    } catch (error) {
      this.logger.error('Error finalizing Cartesia TTS', error);
      throw error;
    }
  }

  /**
   * Disconnect from Cartesia WebSocket
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Not connected to Cartesia TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Cartesia TTS WebSocket');

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;
      this.contextId = null;
      this.hasSentFirstChunk = false;

      this.logger.info('Disconnected from Cartesia TTS WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Cartesia TTS', error);
      throw error;
    }
  }

  /**
   * Check if currently connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
