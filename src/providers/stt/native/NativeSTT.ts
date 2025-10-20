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
  // State is now managed externally by AudioCaptureStateMachine!
  // No more isRecognizing or isPaused flags

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
    if (this.recognition) {
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

      // Note: State machine will handle error recovery
    };

    this.recognition.onend = () => {
      this.logger.debug('Recognition ended - state machine will handle restart if needed');
      // Note: No auto-restart logic! AudioCaptureStateMachine manages lifecycle
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

    if (!this.recognition) {
      throw new ProviderConnectionError('NativeSTT', new Error('Recognition not initialized'));
    }

    try {
      this.recognition.start();
      this.logger.info('✅ Started recognition');
      return Promise.resolve();
    } catch (error) {
      // If already started, that's okay - state machine manages lifecycle
      if (error instanceof Error && error.message.includes('already started')) {
        this.logger.debug('Recognition already started (state machine handles this)');
        return Promise.resolve();
      }
      throw new ProviderConnectionError('NativeSTT', error as Error);
    }
  }

  /**
   * Disconnect and stop recognition (stateless)
   */
  override disconnect(): Promise<void> {
    if (!this.recognition) {
      this.logger.debug('No recognition object to disconnect');
      return Promise.resolve();
    }

    try {
      this.recognition.stop();
      this.logger.info('✅ Stopped recognition');
    } catch (error) {
      this.logger.debug('Error stopping recognition (may already be stopped):', error);
    }

    return Promise.resolve();
  }

  /**
   * Check if recognition object exists and is ready
   */
  isConnected(): boolean {
    return this.recognition !== null;
  }

  /**
   * Native provider doesn't use sendAudio (it directly accesses microphone)
   */
  override sendAudio(_chunk: ArrayBuffer): void {
    this.logger.warn('sendAudio() is not supported for native STT provider');
  }
}
