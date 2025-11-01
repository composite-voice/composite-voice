/**
 * Native browser STT provider using Web Speech API
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
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
 * Browser manages microphone directly - CompositeVoice does NOT send audio
 */
export class NativeSTT extends LiveSTTProvider {
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
  }

  protected onInitialize(): Promise<void> {
    this.logger.debug('Starting NativeSTT initialization');
    
    // Check if Web Speech API is available
    const SpeechRecognitionAPI =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ||
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.logger.error('Web Speech API is not supported in this browser');
      throw new Error('Web Speech API is not supported in this browser');
    }

    this.logger.debug('Creating SpeechRecognition instance');
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.lang = this.config.language ?? 'en-US';
    this.recognition.continuous = this.config.continuous ?? true;
    this.recognition.interimResults = this.config.interimResults ?? true;
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;

    this.logger.debug('Setting up event handlers');
    this.setupEventHandlers();
    this.logger.info('Native STT initialized successfully', {
      hasRecognition: !!this.recognition,
      lang: this.recognition.lang,
      continuous: this.recognition.continuous,
    });
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

      this.logger.debug('Recognition result received', {
        transcript,
        isFinal,
        confidence,
        resultIndex: event.resultIndex,
      });

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
      // Provide more helpful error messages
      let errorMessage = event.message || event.error;
      
      if (event.error === 'not-allowed') {
        errorMessage = 'Microphone access denied. Please allow microphone permissions in your browser.';
      } else if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please try speaking again.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (event.error === 'network') {
        errorMessage = 'Network error occurred during speech recognition.';
      }

      this.logger.error(`Recognition error: ${event.error}`, errorMessage);

      // Emit error as transcription result
      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: event.error,
          message: errorMessage,
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
      this.logger.info('✅ Recognition started - listening for speech...');
    };
  }

  /**
   * Request microphone permission before starting recognition
   * The Web Speech API will automatically request permission when start() is called,
   * but we can pre-check using getUserMedia to provide better error messages
   */
  private async checkMicrophonePermission(): Promise<boolean> {
    try {
      // Try to get microphone access (will prompt user if needed)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      this.logger.debug('Microphone permission granted');
      return true;
    } catch (error) {
      this.logger.error('Microphone permission denied or not available', error);
      return false;
    }
  }

  /**
   * Connect and start recognition
   */
  async connect(): Promise<void> {
    this.logger.debug('Attempting to connect NativeSTT', {
      isReady: this.isReady(),
      hasRecognition: !!this.recognition,
      initialized: (this as any).initialized,
    });
    
    this.assertReady();

    if (!this.recognition) {
      this.logger.error('Recognition object is null even though provider is initialized');
      throw new ProviderConnectionError('NativeSTT', new Error('Recognition not initialized'));
    }

    // Check microphone permission first
    this.logger.debug('Checking microphone permission');
    const hasPermission = await this.checkMicrophonePermission();
    if (!hasPermission) {
      this.logger.error('Microphone permission denied');
      throw new ProviderConnectionError(
        'NativeSTT',
        new Error(
          'Microphone permission denied. Please allow microphone access in your browser settings and try again.'
        )
      );
    }

    try {
      this.logger.debug('Starting speech recognition');
      this.recognition.start();
      this.logger.info('✅ Started recognition');
      return Promise.resolve();
    } catch (error) {
      // If already started, that's okay - state machine manages lifecycle
      if (error instanceof Error && error.message.includes('already started')) {
        this.logger.debug('Recognition already started (state machine handles this)');
        return Promise.resolve();
      }
      this.logger.error('Failed to start recognition', error);
      throw new ProviderConnectionError('NativeSTT', error as Error);
    }
  }

  /**
   * Disconnect and stop recognition (stateless)
   */
  disconnect(): Promise<void> {
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
   * Native provider doesn't use sendAudio (it directly accesses microphone via SpeechRecognition API)
   * This method is a no-op and should not be called. CompositeVoice should NOT call this method.
   * 
   * @param _chunk Audio chunk (unused)
   */
  sendAudio(_chunk: ArrayBuffer): void {
    // No-op: Native STT uses SpeechRecognition API which directly accesses the microphone
    // Audio flow: Microphone → SpeechRecognition API → onTranscription callback
    this.logger.debug('sendAudio() called on native STT (no-op - browser manages audio capture)');
  }
}
