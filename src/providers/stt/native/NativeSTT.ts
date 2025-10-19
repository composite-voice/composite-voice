/**
 * Native browser STT provider using Web Speech API
 */

import { BaseSTTProvider } from '../../base/BaseSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { ProviderConnectionError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

// Browser Speech Recognition types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

/**
 * Native STT provider configuration
 */
export interface NativeSTTConfig extends STTProviderConfig {
  /** Enable continuous recognition */
  continuous?: boolean;
  /** Maximum number of alternatives */
  maxAlternatives?: number;
}

/**
 * Native browser STT provider
 * Uses the Web Speech API (SpeechRecognition)
 */
export class NativeSTT extends BaseSTTProvider {
  declare public config: NativeSTTConfig;
  private recognition: SpeechRecognition | null = null;
  private isRecognizing = false;

  constructor(config: Partial<NativeSTTConfig> = {}, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      continuous: config.continuous ?? true,
      maxAlternatives: config.maxAlternatives ?? 1,
      ...config,
    };
    super(finalConfig, logger);
    // Override type after construction - Native API behaves like websocket (streaming)
    (this as { type: 'rest' | 'websocket' }).type = 'websocket';
  }

  protected onInitialize(): Promise<void> {
    // Check if Web Speech API is available
    const SpeechRecognitionAPI =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ||
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      throw new Error('Web Speech API is not supported in this browser');
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.lang = this.config.language ?? 'en-US';
    this.recognition.continuous = this.config.continuous ?? true;
    this.recognition.interimResults = this.config.interimResults ?? true;
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;

    this.setupEventHandlers();
    this.logger.info('Native STT initialized');
    return Promise.resolve();
  }

  protected async onDispose(): Promise<void> {
    if (this.recognition && this.isRecognizing) {
      await this.disconnect();
    }
    this.recognition = null;
  }

  /**
   * Setup recognition event handlers
   */
  private setupEventHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;

      const transcript = result[0]?.transcript ?? '';
      const confidence = result[0]?.confidence ?? 0;
      const isFinal = result.isFinal;

      const transcriptionResult: TranscriptionResult = {
        text: transcript,
        isFinal,
        confidence,
        metadata: {
          resultIndex: event.resultIndex,
        },
      };

      this.emitTranscription(transcriptionResult);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.logger.error('Recognition error', event.error);

      // Emit error as transcription result
      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: event.error,
          message: event.message,
        },
      };

      this.emitTranscription(errorResult);

      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // These are recoverable, recognition will restart
        return;
      }

      // For other errors, stop recognition
      this.isRecognizing = false;
    };

    this.recognition.onend = () => {
      this.logger.debug('Recognition ended');

      // Auto-restart if continuous mode is enabled
      if (this.config.continuous && this.isRecognizing) {
        this.logger.debug('Restarting continuous recognition');
        try {
          this.recognition?.start();
        } catch (error) {
          this.logger.error('Failed to restart recognition', error);
          this.isRecognizing = false;
        }
      } else {
        this.isRecognizing = false;
      }
    };

    this.recognition.onstart = () => {
      this.logger.debug('Recognition started');
    };
  }

  /**
   * Connect and start recognition
   */
  override connect(): Promise<void> {
    this.assertReady();

    if (this.isRecognizing) {
      this.logger.warn('Already recognizing');
      return Promise.resolve();
    }

    if (!this.recognition) {
      throw new ProviderConnectionError('NativeSTT', new Error('Recognition not initialized'));
    }

    try {
      this.recognition.start();
      this.isRecognizing = true;
      this.logger.info('Started recognition');
      return Promise.resolve();
    } catch (error) {
      throw new ProviderConnectionError('NativeSTT', error as Error);
    }
  }

  /**
   * Disconnect and stop recognition
   */
  override disconnect(): Promise<void> {
    if (!this.isRecognizing || !this.recognition) {
      this.logger.warn('Not recognizing');
      return Promise.resolve();
    }

    this.isRecognizing = false;
    this.recognition.stop();
    this.logger.info('Stopped recognition');
    return Promise.resolve();
  }

  /**
   * Check if currently recognizing
   */
  isConnected(): boolean {
    return this.isRecognizing;
  }

  /**
   * Native provider doesn't use sendAudio (it directly accesses microphone)
   */
  override sendAudio(_chunk: ArrayBuffer): void {
    this.logger.warn('sendAudio() is not supported for native STT provider');
  }
}
