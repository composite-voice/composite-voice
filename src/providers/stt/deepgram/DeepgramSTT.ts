/**
 * Deepgram STT provider using the official Deepgram SDK
 * WebSocket-only provider for real-time streaming transcription
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type DeepgramClient = typeof import('@deepgram/sdk').createClient;
type LiveClient = import('@deepgram/sdk').LiveClient;

/**
 * Deepgram-specific transcription options
 */
export interface DeepgramTranscriptionOptions {
  /** Model to use (e.g., 'nova-2', 'nova', 'enhanced', 'base') */
  model?: string;
  /** Language code (e.g., 'en-US', 'es') */
  language?: string;
  /** Enable punctuation */
  punctuation?: boolean;
  /** Enable profanity filter */
  profanityFilter?: boolean;
  /** Enable redaction of sensitive information (e.g., 'pci', 'ssn') */
  redact?: string[];
  /** Enable diarization (speaker detection) */
  diarize?: boolean;
  /** Enable smart formatting */
  smartFormat?: boolean;
  /** Custom vocabulary or keywords to boost recognition */
  keywords?: string[];
  /** Number of transcription alternatives to return */
  alternatives?: number;
  /** Enable utterance segmentation */
  utterances?: boolean;
  /** Enable interim results */
  interimResults?: boolean;
  /** Encoding for audio data (e.g., 'linear16', 'opus') */
  encoding?: string;
  /** Sample rate for audio data */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Enable automatic endpointing */
  endpointing?: boolean | number;
  /** Voice Activity Detection (VAD) events */
  vadEvents?: boolean;
}

/**
 * Deepgram STT provider configuration
 */
export interface DeepgramSTTConfig extends STTProviderConfig {
  /** Deepgram API key */
  apiKey: string;
  /** Deepgram transcription options */
  options?: DeepgramTranscriptionOptions;
}

/**
 * Deepgram STT provider
 * Real-time streaming transcription via WebSocket
 * CompositeVoice manages audio capture and sends chunks to this provider
 */
export class DeepgramSTT extends LiveSTTProvider {
  declare public config: DeepgramSTTConfig;
  private deepgram: Awaited<ReturnType<DeepgramClient>> | null = null;
  private liveClient: LiveClient | null = null;
  private isConnected = false;

  constructor(config: DeepgramSTTConfig, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      ...config,
    };
    super(finalConfig, logger);
  }

  protected async onInitialize(): Promise<void> {
    try {
      // Dynamically import Deepgram SDK (peer dependency)
      const DeepgramModule = await import('@deepgram/sdk');
      const { createClient } = DeepgramModule;

      // Initialize Deepgram client
      this.deepgram = createClient(this.config.apiKey);

      this.logger.info('Deepgram STT initialized (WebSocket mode)', {
        model: this.config.options?.model ?? 'nova-2',
        language: this.config.language,
      });
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'DeepgramSTT',
          new Error(
            'Deepgram SDK not found. Install with: npm install @deepgram/sdk\n' +
              'The Deepgram SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('DeepgramSTT', error as Error);
    }
  }

  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.liveClient = null;
    this.deepgram = null;
    this.logger.info('Deepgram STT disposed');
  }

  /**
   * Connect to Deepgram WebSocket for real-time transcription
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram');
      return;
    }

    if (!this.deepgram) {
      throw new ProviderConnectionError(
        'DeepgramSTT',
        new Error('Deepgram client not initialized')
      );
    }

    try {
      this.logger.debug('Connecting to Deepgram WebSocket');

      // Build connection options
      const options: Record<string, unknown> = {
        model: this.config.options?.model ?? 'nova-2',
        language: this.config.language,
        punctuate: this.config.options?.punctuation ?? true,
        smart_format: this.config.options?.smartFormat ?? true,
        interim_results: this.config.interimResults ?? true,
        endpointing: this.config.options?.endpointing ?? false,
        vad_events: this.config.options?.vadEvents ?? false,
        profanity_filter: this.config.options?.profanityFilter ?? false,
        diarize: this.config.options?.diarize ?? false,
        utterances: this.config.options?.utterances ?? false,
      };

      // Add encoding and sample rate for audio configuration
      if (this.config.options?.encoding) {
        options.encoding = this.config.options.encoding;
      }
      if (this.config.options?.sampleRate) {
        options.sample_rate = this.config.options.sampleRate;
      }
      if (this.config.options?.channels) {
        options.channels = this.config.options.channels;
      }

      // Add optional parameters
      if (this.config.options?.redact && this.config.options.redact.length > 0) {
        options.redact = this.config.options.redact;
      }
      if (this.config.options?.keywords && this.config.options.keywords.length > 0) {
        options.keywords = this.config.options.keywords;
      }
      if (this.config.options?.alternatives) {
        options.alternatives = this.config.options.alternatives;
      }

      // Create live transcription connection
      this.liveClient = this.deepgram.listen.live(
        options as Parameters<typeof this.deepgram.listen.live>[0]
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout ?? 10000);

        this.liveClient?.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram WebSocket');
          resolve();
        });

        this.liveClient?.on('error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('Failed to connect to Deepgram WebSocket', error);
          reject(error);
        });
      });
    } catch (error) {
      this.liveClient = null;
      throw new ProviderConnectionError('DeepgramSTT', error as Error);
    }
  }

  /**
   * Setup event handlers for live transcription
   */
  private setupEventHandlers(): void {
    if (!this.liveClient) return;

    // Handle transcription results
    this.liveClient.on('Transcript', (data: unknown) => {
      try {
        const transcriptData = data as {
          channel?: {
            alternatives?: Array<{
              transcript: string;
              confidence: number;
            }>;
          };
          is_final?: boolean;
          speech_final?: boolean;
          duration?: number;
        };

        const alternative = transcriptData?.channel?.alternatives?.[0];
        if (!alternative) return;

        const transcript = alternative.transcript;
        const confidence = alternative.confidence;
        const isFinal = transcriptData.is_final ?? false;
        const speechFinal = transcriptData.speech_final ?? false;

        // Only emit if there's actual text or it's a final result
        if (transcript || isFinal) {
          const result: TranscriptionResult = {
            text: transcript,
            isFinal,
            confidence,
            metadata: {
              speechFinal,
              duration: transcriptData.duration,
            },
          };

          this.emitTranscription(result);
        }
      } catch (error) {
        this.logger.error('Error processing transcript', error);
      }
    });

    // Handle metadata events
    this.liveClient.on('Metadata', (data: unknown) => {
      this.logger.debug('Metadata received', data);
    });

    // Handle errors
    this.liveClient.on('error', (error: Error) => {
      this.logger.error('Deepgram WebSocket error', error);

      // Emit error as transcription result
      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: error.message,
        },
      };

      this.emitTranscription(errorResult);
    });

    // Handle warnings
    this.liveClient.on('warning', (warning: unknown) => {
      this.logger.warn('Deepgram WebSocket warning', warning);
    });

    // Handle close
    this.liveClient.on('close', () => {
      this.logger.info('Deepgram WebSocket closed');
      this.isConnected = false;
    });

    // Handle utterance end (if enabled)
    this.liveClient.on('UtteranceEnd', (data: unknown) => {
      this.logger.debug('Utterance end', data);

      // Emit utterance end event as a final transcription
      const result: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 1,
        metadata: {
          event: 'utterance_end',
          data,
        },
      };

      this.emitTranscription(result);
    });

    // Handle speech started event (if VAD enabled)
    this.liveClient.on('SpeechStarted', (data: unknown) => {
      this.logger.debug('Speech started', data);

      const result: TranscriptionResult = {
        text: '',
        isFinal: false,
        confidence: 1,
        metadata: {
          event: 'speech_started',
          data,
        },
      };

      this.emitTranscription(result);
    });
  }

  /**
   * Send audio chunk for real-time transcription
   * CompositeVoice sends audio chunks TO this provider
   * @param chunk Audio data chunk (ArrayBuffer)
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.liveClient) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      // Send audio data to Deepgram
      // Send as ArrayBuffer directly which is compatible with WebSocket
      this.liveClient.send(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Disconnect from Deepgram WebSocket
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.liveClient) {
      this.logger.warn('Not connected to Deepgram');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram WebSocket');

      // Finish the stream
      this.liveClient.finish();

      // Wait for close event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.liveClient?.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isConnected = false;
      this.liveClient = null;

      this.logger.info('Disconnected from Deepgram WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram', error);
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
