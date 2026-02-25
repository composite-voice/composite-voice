/**
 * Deepgram real-time speech-to-text provider using the official Deepgram SDK.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type DeepgramClient = typeof import('@deepgram/sdk').createClient;
type LiveClient = import('@deepgram/sdk').LiveClient;

/**
 * Deepgram-specific transcription options passed to the WebSocket connection.
 *
 * @remarks
 * These options map to Deepgram's
 * {@link https://developers.deepgram.com/docs/streaming | real-time streaming API}
 * parameters. They are set on the {@link DeepgramSTTConfig.options} property
 * and forwarded when the WebSocket connection is established.
 *
 * @see {@link DeepgramSTTConfig} for the full provider configuration
 */
export interface DeepgramTranscriptionOptions {
  /**
   * Model to use.
   * Latest (default): 'nova-3'
   * Previous: 'nova-2', 'nova', 'enhanced', 'base'
   */
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
 * Configuration options for the {@link DeepgramSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Deepgram-specific settings. You must
 * provide **either** `apiKey` (for direct browser-to-Deepgram connections) or
 * `proxyUrl` (for server-side proxy that injects the API key). If both are
 * provided, `proxyUrl` takes precedence.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: DeepgramSTTConfig = {
 *   apiKey: 'dg_abc123...',
 *   options: { model: 'nova-3', smartFormat: true },
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: DeepgramSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   options: { model: 'nova-3', punctuation: true },
 * };
 * ```
 *
 * @see {@link DeepgramTranscriptionOptions} for transcription-specific settings
 * @see {@link DeepgramSTT} for the provider class
 */
export interface DeepgramSTTConfig extends STTProviderConfig {
  /**
   * Deepgram API key.
   * Required when connecting directly to Deepgram.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's Deepgram endpoint.
   * Example: `'http://localhost:3000/api/proxy/deepgram'`
   *
   * When set, the Deepgram SDK connects to this URL instead of
   * `wss://api.deepgram.com`, allowing browsers to reach Deepgram through a
   * same-origin proxy that injects the real API key server-side.
   */
  proxyUrl?: string;
  /** Deepgram transcription options */
  options?: DeepgramTranscriptionOptions;
}

/**
 * Deepgram real-time STT provider using the official `@deepgram/sdk`.
 *
 * @remarks
 * `DeepgramSTT` extends {@link LiveSTTProvider} and connects to Deepgram's
 * WebSocket-based streaming transcription API. It supports:
 *
 * - Real-time interim and final transcription results
 * - Multi-segment utterance buffering (accumulates `is_final` segments
 *   until `speech_final` to deliver a complete utterance)
 * - Deepgram v2 preflight / eager end-of-turn signals for speculative
 *   LLM generation
 * - Proxy mode via {@link DeepgramSTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 *
 * **Transport:** WebSocket (via `@deepgram/sdk`)
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * Requires the `@deepgram/sdk` peer dependency to be installed.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> Deepgram WebSocket
 *                                                       |
 * CompositeVoice <- onTranscription(result) <----------+
 * ```
 *
 * @example
 * ```ts
 * import { DeepgramSTT } from 'composite-voice';
 *
 * const stt = new DeepgramSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   language: 'en-US',
 *   interimResults: true,
 *   options: {
 *     model: 'nova-3',
 *     smartFormat: true,
 *     punctuation: true,
 *   },
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   if (result.isFinal && result.speechFinal) {
 *     console.log('Complete utterance:', result.text);
 *   }
 * });
 *
 * await stt.connect();
 * // ... send audio chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link DeepgramSTTConfig} for configuration options
 * @see {@link DeepgramTranscriptionOptions} for transcription parameters
 * @see {@link AssemblyAISTT} for an alternative real-time STT provider
 */
export class DeepgramSTT extends LiveSTTProvider {
  declare public config: DeepgramSTTConfig;

  /** The Deepgram SDK client instance. */
  private deepgram: Awaited<ReturnType<DeepgramClient>> | null = null;

  /** The active Deepgram live transcription WebSocket client. */
  private liveClient: LiveClient | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Accumulates `is_final` transcript segments within an utterance.
   *
   * @remarks
   * Deepgram may split one utterance into multiple `is_final` chunks before
   * emitting `speech_final`. We buffer them so we can hand the complete
   * utterance text to CompositeVoice as a single `speechFinal` result.
   */
  private utteranceBuffer: string[] = [];

  /**
   * Create a new DeepgramSTT provider.
   *
   * @param config - Deepgram STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new DeepgramSTT({
   *   apiKey: 'dg_abc123...',
   *   options: { model: 'nova-3' },
   * });
   * ```
   */
  constructor(config: DeepgramSTTConfig, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Dynamically import the Deepgram SDK and create the client.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is configured, or when
   * the `@deepgram/sdk` peer dependency is not installed.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'DeepgramSTT',
        new Error('DeepgramSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Deepgram SDK (peer dependency)
      const DeepgramModule = await import('@deepgram/sdk');
      const { createClient } = DeepgramModule;

      if (this.config.proxyUrl) {
        // Proxy mode: redirect all SDK connections to the proxy server.
        // The proxy injects the real Deepgram API key server-side.
        // Convert http(s) → ws(s) for the SDK's WebSocket URL.
        const wsUrl = this.config.proxyUrl.replace(/^http/, 'ws');
        this.deepgram = createClient('proxy', { global: { url: wsUrl } });
        this.logger.info('Deepgram STT initialized (proxy mode)', { proxyUrl: wsUrl });
      } else {
        this.deepgram = createClient(this.config.apiKey as string);
        this.logger.info('Deepgram STT initialized (WebSocket mode)', {
          model: this.config.options?.model ?? 'nova-3',
          language: this.config.language,
        });
      }
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

  /** Disconnect the WebSocket (if connected) and release SDK resources. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.utteranceBuffer = [];
    this.liveClient = null;
    this.deepgram = null;
    this.logger.info('Deepgram STT disposed');
  }

  /**
   * Open a WebSocket connection to Deepgram for real-time transcription.
   *
   * @remarks
   * Builds connection options from {@link DeepgramSTTConfig} and waits for
   * the WebSocket `open` event before resolving. The connection timeout
   * defaults to {@link DeepgramSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the Deepgram client is
   * missing, or the connection times out / errors.
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
        model: this.config.options?.model ?? 'nova-3',
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
   * Wire up event handlers on the Deepgram {@link liveClient} for
   * `Transcript`, `EarlyEndOfTurn`, `Metadata`, `error`, `warning`,
   * `close`, `UtteranceEnd`, and `SpeechStarted` events.
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
          /** Deepgram v2 eager/preflight end-of-turn signal */
          preflight?: boolean;
          duration?: number;
        };

        const alternative = transcriptData?.channel?.alternatives?.[0];
        if (!alternative) return;

        const transcript = alternative.transcript;
        const confidence = alternative.confidence;
        const isFinal = transcriptData.is_final ?? false;
        const speechFinal = transcriptData.speech_final ?? false;
        const isPreflight = transcriptData.preflight ?? false;

        // --- Preflight / eager end-of-turn (Deepgram v2 models) ---
        // Emit early so CompositeVoice can start the LLM speculatively.
        // We also emit a normal interim-style event so subscribers see the text.
        if (isPreflight && transcript) {
          this.logger.debug('Deepgram preflight (eager end-of-turn)', { transcript });
          this.emitTranscription({
            text: transcript,
            isFinal: false,
            isPreflight: true,
            confidence,
            metadata: { duration: transcriptData.duration },
          });
          return;
        }

        if (isFinal) {
          // Accumulate this segment into the current utterance
          if (transcript) {
            this.utteranceBuffer.push(transcript);
          }

          if (speechFinal) {
            // Utterance complete — emit with the fully accumulated text
            const fullText = this.utteranceBuffer.join(' ').trim();
            this.utteranceBuffer = [];

            this.logger.debug('Deepgram speech_final — full utterance', { fullText });

            // Always emit the final-segment event first so interim displays update
            if (transcript) {
              this.emitTranscription({
                text: transcript,
                isFinal: true,
                speechFinal: false,
                confidence,
                metadata: { speechFinal: false, duration: transcriptData.duration },
              });
            }

            // Emit the complete utterance as the speech-final result
            this.emitTranscription({
              text: fullText,
              isFinal: true,
              speechFinal: true,
              confidence,
              metadata: { speechFinal: true, duration: transcriptData.duration },
            });
          } else {
            // Mid-utterance final segment — emit for display but not for LLM
            if (transcript) {
              this.emitTranscription({
                text: transcript,
                isFinal: true,
                speechFinal: false,
                confidence,
                metadata: { speechFinal: false, duration: transcriptData.duration },
              });
            }
          }
        } else {
          // Interim result — pass through as-is for real-time display
          if (transcript) {
            this.emitTranscription({
              text: transcript,
              isFinal: false,
              confidence,
              metadata: { duration: transcriptData.duration },
            });
          }
        }
      } catch (error) {
        this.logger.error('Error processing transcript', error);
      }
    });

    // Handle Deepgram v2 EarlyEndOfTurn event (models like flux-general-en)
    // This is a separate event type in newer SDK versions that signals the model
    // believes the speaker has finished before speech_final is confirmed.
    this.liveClient.on('EarlyEndOfTurn', (data: unknown) => {
      try {
        const earlyEnd = data as {
          channel?: {
            alternatives?: Array<{ transcript: string; confidence: number }>;
          };
        };
        const transcript = earlyEnd?.channel?.alternatives?.[0]?.transcript ?? '';
        const confidence = earlyEnd?.channel?.alternatives?.[0]?.confidence;

        this.logger.debug('Deepgram EarlyEndOfTurn (preflight)', { transcript });

        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: false,
            isPreflight: true,
            ...(confidence !== undefined && { confidence }),
            metadata: { event: 'early_end_of_turn' },
          });
        }
      } catch (error) {
        this.logger.error('Error processing EarlyEndOfTurn event', error);
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
   * Send a raw audio chunk to Deepgram for real-time transcription.
   *
   * @remarks
   * The chunk is sent as a raw `ArrayBuffer` directly over the WebSocket.
   * If the connection is not open, the chunk is silently dropped and a
   * warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
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
   * Gracefully close the Deepgram WebSocket connection.
   *
   * @remarks
   * Calls `liveClient.finish()` to signal end-of-stream, then waits up
   * to 1 second for the `close` event before force-resolving. Resets the
   * utterance buffer and internal connection state.
   *
   * @throws Re-throws any unexpected error during disconnection.
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
      this.utteranceBuffer = [];
      this.liveClient = null;

      this.logger.info('Disconnected from Deepgram WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram', error);
      throw error;
    }
  }

  /**
   * Check whether the Deepgram WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
