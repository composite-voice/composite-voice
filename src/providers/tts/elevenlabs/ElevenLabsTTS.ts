/**
 * ElevenLabs TTS provider using WebSocket streaming API
 * Real-time streaming text-to-speech via WebSocket
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
 * ElevenLabs voice model IDs
 */
export type ElevenLabsTTSModel =
  | 'eleven_turbo_v2_5'
  | 'eleven_turbo_v2'
  | 'eleven_multilingual_v2'
  | 'eleven_monolingual_v1'
  | (string & {});

/**
 * ElevenLabs output format options
 */
export type ElevenLabsOutputFormat =
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'mp3_44100_128'
  | 'ulaw_8000'
  | (string & {});

/**
 * ElevenLabs TTS provider configuration.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 */
export interface ElevenLabsTTSConfig extends TTSProviderConfig {
  /**
   * ElevenLabs API key.
   * Required when connecting directly to ElevenLabs.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's ElevenLabs endpoint.
   * Example: `'http://localhost:3000/api/proxy/elevenlabs'`
   */
  proxyUrl?: string;
  /**
   * ElevenLabs voice ID (required).
   * Find voice IDs via the ElevenLabs voice library.
   */
  voiceId: string;
  /**
   * Model ID to use for synthesis.
   * @default 'eleven_turbo_v2_5'
   */
  modelId?: ElevenLabsTTSModel;
  /**
   * Voice stability (0-1). Higher values produce more consistent output.
   * @default 0.5
   */
  stability?: number;
  /**
   * Similarity boost (0-1). Higher values make the voice more closely match the original.
   * @default 0.75
   */
  similarityBoost?: number;
  /**
   * Output audio format.
   * @default 'pcm_16000'
   */
  outputFormat?: ElevenLabsOutputFormat;
}

/** Sample rates derived from output format strings */
const FORMAT_SAMPLE_RATES: Record<string, number> = {
  pcm_16000: 16000,
  pcm_22050: 22050,
  pcm_24000: 24000,
  pcm_44100: 44100,
  mp3_44100_128: 44100,
  ulaw_8000: 8000,
};

/** Encoding types derived from output format strings */
const FORMAT_ENCODINGS: Record<string, string> = {
  pcm_16000: 'linear16',
  pcm_22050: 'linear16',
  pcm_24000: 'linear16',
  pcm_44100: 'linear16',
  mp3_44100_128: 'mp3',
  ulaw_8000: 'mulaw',
};

/**
 * ElevenLabs TTS provider
 * Real-time streaming text-to-speech via WebSocket
 * CompositeVoice sends text chunks to this provider and receives audio chunks
 */
export class ElevenLabsTTS extends LiveTTSProvider {
  declare public config: ElevenLabsTTSConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;

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

  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.logger.info('ElevenLabs TTS disposed');
  }

  /**
   * Build the WebSocket URL for ElevenLabs streaming TTS
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
   * Connect to ElevenLabs WebSocket for real-time TTS
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
   * Handle incoming WebSocket messages (audio chunks and metadata)
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
   * Process raw audio data and emit as AudioChunk
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
   * Get sample rate from output format
   */
  private getSampleRate(): number {
    const format = this.config.outputFormat ?? 'pcm_16000';
    return FORMAT_SAMPLE_RATES[format] ?? this.config.sampleRate ?? 16000;
  }

  /**
   * Get audio encoding from output format
   */
  private getEncoding(): 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw' {
    const format = this.config.outputFormat ?? 'pcm_16000';
    return (FORMAT_ENCODINGS[format] ?? 'linear16') as 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw';
  }

  /**
   * Send text chunk for real-time synthesis
   * CompositeVoice sends text TO this provider
   * @param chunk Text to synthesize
   */
  sendText(chunk: string): void {
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
   * Finalize synthesis — send empty text with flush to trigger remaining audio
   */
  async finalize(): Promise<void> {
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
   * Disconnect from ElevenLabs WebSocket
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
   * Check if currently connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
