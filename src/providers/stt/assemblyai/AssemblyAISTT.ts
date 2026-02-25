/**
 * AssemblyAI STT provider using WebSocket real-time transcription API
 * Real-time streaming speech-to-text via WebSocket
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import {
  WebSocketManager,
  type WebSocketManagerOptions,
} from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * AssemblyAI STT provider configuration.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
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
 * AssemblyAI real-time message types
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
 * AssemblyAI STT provider
 * Real-time streaming transcription via WebSocket
 * CompositeVoice manages audio capture and sends chunks to this provider
 */
export class AssemblyAISTT extends LiveSTTProvider {
  declare public config: AssemblyAISTTConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;

  constructor(config: AssemblyAISTTConfig, logger?: Logger) {
    const finalConfig: AssemblyAISTTConfig = {
      sampleRate: 16000,
      language: 'en',
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

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

  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.logger.info('AssemblyAI STT disposed');
  }

  /**
   * Build the WebSocket URL for AssemblyAI real-time transcription
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
   * Connect to AssemblyAI WebSocket for real-time transcription
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
        reconnection: {
          enabled: true,
          maxAttempts: 5,
          initialDelay: 1000,
          maxDelay: 30000,
          backoffMultiplier: 2,
        },
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
   * Handle incoming WebSocket messages from AssemblyAI
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
   * Send audio chunk for real-time transcription
   * Audio is sent as base64-encoded data in JSON format
   * @param chunk Audio data chunk (ArrayBuffer)
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

      const message = JSON.stringify({
        audio_data: base64Audio,
      });

      this.wsManager.send(message);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Disconnect from AssemblyAI WebSocket
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Not connected to AssemblyAI STT');
      return;
    }

    try {
      this.logger.debug('Disconnecting from AssemblyAI STT WebSocket');

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
   * Check if currently connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
