/**
 * Main CompositeVoice SDK class
 */

import { EventEmitter } from './core/events/EventEmitter';
import type {
  CompositeVoiceEvent,
  EventType,
  EventListenerMap,
  AgentState,
} from './core/events/types';
import type { CompositeVoiceConfig } from './core/types/config';
import { AudioCapture } from './core/audio/AudioCapture';
import { AudioPlayer } from './core/audio/AudioPlayer';
import { AgentStateMachine } from './core/state/AgentState';
import { Logger, createLogger } from './utils/logger';
import { ConfigurationError, InvalidStateError } from './utils/errors';
import {
  DEFAULT_AUDIO_INPUT_CONFIG,
  DEFAULT_AUDIO_OUTPUT_CONFIG,
  DEFAULT_LOGGING_CONFIG,
} from './core/types/config';

/**
 * Main CompositeVoice SDK class
 */
export class CompositeVoice {
  private config: CompositeVoiceConfig;
  private events: EventEmitter;
  private logger: Logger;
  private stateMachine: AgentStateMachine;
  private audioCapture: AudioCapture;
  private audioPlayer: AudioPlayer;
  private initialized = false;

  constructor(config: CompositeVoiceConfig) {
    this.validateConfig(config);
    this.config = config;

    // Setup logging
    const loggingConfig = { ...DEFAULT_LOGGING_CONFIG, ...config.logging };
    this.logger = createLogger('CompositeVoice', loggingConfig);

    // Initialize event emitter
    this.events = new EventEmitter();

    // Initialize state machine
    this.stateMachine = new AgentStateMachine(this.logger);

    // Setup state change event emission
    this.stateMachine.onTransition((newState, oldState) => {
      this.emitEvent({
        type: 'agent.stateChange',
        state: newState,
        previousState: oldState,
        timestamp: Date.now(),
      });
    });

    // Initialize audio components
    const audioInputConfig = { ...DEFAULT_AUDIO_INPUT_CONFIG, ...config.audio?.input };
    const audioOutputConfig = { ...DEFAULT_AUDIO_OUTPUT_CONFIG, ...config.audio?.output };

    this.audioCapture = new AudioCapture(audioInputConfig, this.logger);
    this.audioPlayer = new AudioPlayer(audioOutputConfig, this.logger);

    // Setup audio player callbacks
    this.audioPlayer.setCallbacks({
      onStart: () => this.handlePlaybackStart(),
      onEnd: () => this.handlePlaybackEnd(),
      onError: (error) => this.handlePlaybackError(error),
    });
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: CompositeVoiceConfig): void {
    if (config.mode === 'composite') {
      if (!config.stt || !config.llm || !config.tts) {
        throw new ConfigurationError('Composite mode requires stt, llm, and tts providers');
      }
    } else if (config.mode === 'all-in-one') {
      if (!config.provider) {
        throw new ConfigurationError('All-in-one mode requires a provider');
      }
    } else {
      throw new ConfigurationError(`Invalid mode: ${(config as { mode: string }).mode}`);
    }
  }

  /**
   * Initialize the SDK and all providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }

    this.logger.info('Initializing CompositeVoice SDK');

    try {
      // Initialize providers
      if (this.config.mode === 'composite') {
        await Promise.all([
          this.config.stt.initialize(),
          this.config.llm.initialize(),
          this.config.tts.initialize(),
        ]);
        this.setupCompositeProviders();
      } else if (this.config.mode === 'all-in-one') {
        await this.config.provider.initialize();
        this.setupAllInOneProvider();
      }

      this.initialized = true;
      this.stateMachine.setReady();

      this.emitEvent({
        type: 'agent.ready',
        timestamp: Date.now(),
      });

      this.logger.info('CompositeVoice SDK initialized');
    } catch (error) {
      this.logger.error('Failed to initialize', error);
      this.stateMachine.setError();
      throw error;
    }
  }

  /**
   * Setup composite provider event handlers
   */
  private setupCompositeProviders(): void {
    if (this.config.mode !== 'composite') return;

    const { stt, tts } = this.config;

    // Setup STT provider callbacks
    stt.onTranscription?.((result) => {
      const event = {
        type: result.isFinal
          ? ('transcription.final' as const)
          : ('transcription.interim' as const),
        text: result.text,
        confidence: result.confidence,
        timestamp: Date.now(),
        metadata: result.metadata,
      };
      this.emitEvent(event as CompositeVoiceEvent);

      // If final transcription, send to LLM
      if (result.isFinal && result.text.trim()) {
        void this.processLLM(result.text);
      }
    });

    // Setup TTS provider callbacks (if WebSocket)
    if (tts.onAudio) {
      tts.onAudio((chunk) => {
        this.emitEvent({
          type: 'tts.audio',
          chunk,
          timestamp: Date.now(),
        });
        void this.audioPlayer.addChunk(chunk);
      });
    }

    if (tts.onMetadata) {
      tts.onMetadata((metadata) => {
        this.emitEvent({
          type: 'tts.metadata',
          metadata,
          timestamp: Date.now(),
        });
        this.audioPlayer.setMetadata(metadata);
      });
    }
  }

  /**
   * Setup all-in-one provider event handlers
   */
  private setupAllInOneProvider(): void {
    if (this.config.mode !== 'all-in-one') return;

    const { provider } = this.config;

    // Setup transcription callback
    provider.onTranscription?.((result) => {
      const event = {
        type: result.isFinal
          ? ('transcription.final' as const)
          : ('transcription.interim' as const),
        text: result.text,
        confidence: result.confidence,
        timestamp: Date.now(),
        metadata: result.metadata,
      };
      this.emitEvent(event as CompositeVoiceEvent);
    });

    // Setup LLM chunk callback
    provider.onLLMChunk?.((text) => {
      this.emitEvent({
        type: 'llm.chunk',
        chunk: text,
        accumulated: '', // Provider should track this
        timestamp: Date.now(),
      });
    });

    // Setup audio callback
    provider.onAudio?.((chunk) => {
      this.emitEvent({
        type: 'tts.audio',
        chunk,
        timestamp: Date.now(),
      });
      void this.audioPlayer.addChunk(chunk);
    });

    // Setup metadata callback
    provider.onMetadata?.((metadata) => {
      this.emitEvent({
        type: 'tts.metadata',
        metadata,
        timestamp: Date.now(),
      });
      this.audioPlayer.setMetadata(metadata);
    });
  }

  /**
   * Process text through LLM
   */
  private async processLLM(text: string): Promise<void> {
    if (this.config.mode !== 'composite') return;

    this.stateMachine.setThinking();

    this.emitEvent({
      type: 'llm.start',
      prompt: text,
      timestamp: Date.now(),
    });

    try {
      const { llm, tts } = this.config;
      const responseIterable = await llm.generate(text);
      let fullResponse = '';

      // Stream LLM response
      for await (const chunk of responseIterable) {
        fullResponse += chunk;
        this.emitEvent({
          type: 'llm.chunk',
          chunk,
          accumulated: fullResponse,
          timestamp: Date.now(),
        });

        // If TTS supports streaming, send chunks
        if (tts.sendText && tts.type === 'websocket') {
          tts.sendText(chunk);
        }
      }

      this.emitEvent({
        type: 'llm.complete',
        text: fullResponse,
        timestamp: Date.now(),
      });

      // If TTS doesn't support streaming, send full response
      if (tts.synthesize) {
        await this.processTTS(fullResponse);
      } else if (tts.finalize) {
        // Finalize streaming TTS
        await tts.finalize();
      }
    } catch (error) {
      this.logger.error('LLM processing error', error);
      this.emitEvent({
        type: 'llm.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });
      this.stateMachine.setError();
    }
  }

  /**
   * Process text through TTS
   */
  private async processTTS(text: string): Promise<void> {
    if (this.config.mode !== 'composite') return;

    this.emitEvent({
      type: 'tts.start',
      text,
      timestamp: Date.now(),
    });

    try {
      const { tts } = this.config;

      if (tts.synthesize) {
        const audioBlob = await tts.synthesize(text);
        await this.audioPlayer.play(audioBlob);
      }

      this.emitEvent({
        type: 'tts.complete',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('TTS processing error', error);
      this.emitEvent({
        type: 'tts.error',
        error: error as Error,
        recoverable: true,
        timestamp: Date.now(),
      });
      this.stateMachine.setError();
    }
  }

  /**
   * Handle playback start
   */
  private handlePlaybackStart(): void {
    this.stateMachine.setSpeaking();
    this.emitEvent({
      type: 'audio.playback.start',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle playback end
   */
  private handlePlaybackEnd(): void {
    this.stateMachine.setReady();
    this.emitEvent({
      type: 'audio.playback.end',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle playback error
   */
  private handlePlaybackError(error: Error): void {
    this.emitEvent({
      type: 'audio.playback.error',
      error,
      timestamp: Date.now(),
    });
  }

  /**
   * Start listening for user input
   */
  async startListening(): Promise<void> {
    this.assertInitialized();

    if (!this.stateMachine.is('ready')) {
      throw new InvalidStateError(this.stateMachine.getState(), 'start listening');
    }

    this.logger.info('Starting to listen');
    this.stateMachine.setListening();

    try {
      if (this.config.mode === 'composite') {
        const { stt } = this.config;

        if (stt.connect) {
          // WebSocket STT: connect and start streaming
          await stt.connect();
          await this.audioCapture.start((audioData) => {
            stt.sendAudio?.(audioData);
          });
        } else {
          // REST STT: record audio for later submission
          // This would need additional implementation
          this.logger.warn('REST STT not yet implemented for streaming');
        }
      } else {
        // All-in-one provider
        if (this.config.mode === 'all-in-one') {
          await this.config.provider.connect();
          await this.audioCapture.start((audioData) => {
            if (this.config.mode === 'all-in-one') {
              this.config.provider.sendAudio(audioData);
            }
          });
        }
      }

      this.emitEvent({
        type: 'audio.capture.start',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to start listening', error);
      this.stateMachine.setError();
      throw error;
    }
  }

  /**
   * Stop listening
   */
  async stopListening(): Promise<void> {
    this.assertInitialized();

    if (!this.stateMachine.is('listening')) {
      this.logger.warn('Not currently listening');
      return;
    }

    this.logger.info('Stopping listening');

    try {
      await this.audioCapture.stop();

      if (this.config.mode === 'composite') {
        const { stt } = this.config;
        if (stt.disconnect) {
          await stt.disconnect();
        }
      } else if (this.config.mode === 'all-in-one') {
        await this.config.provider.disconnect();
      }

      this.emitEvent({
        type: 'audio.capture.stop',
        timestamp: Date.now(),
      });

      this.stateMachine.setReady();
    } catch (error) {
      this.logger.error('Failed to stop listening', error);
      throw error;
    }
  }

  /**
   * Stop audio playback
   */
  async stopSpeaking(): Promise<void> {
    this.assertInitialized();
    await this.audioPlayer.stop();
  }

  /**
   * Register an event listener
   */
  on<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): () => void {
    return this.events.on(event, listener);
  }

  /**
   * Register a one-time event listener
   */
  once<T extends EventType>(event: T, listener: EventListenerMap[T]): () => void {
    return this.events.once(event, listener);
  }

  /**
   * Remove an event listener
   */
  off<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? (event: CompositeVoiceEvent) => void : EventListenerMap[T]
  ): void {
    this.events.off(event, listener);
  }

  /**
   * Emit an event
   */
  private emitEvent(event: CompositeVoiceEvent): void {
    this.events.emitSync(event);
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return this.stateMachine.getState();
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Assert that SDK is initialized
   */
  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('CompositeVoice is not initialized. Call initialize() first.');
    }
  }

  /**
   * Get audio capture instance
   */
  getAudioCapture(): AudioCapture {
    return this.audioCapture;
  }

  /**
   * Get audio player instance
   */
  getAudioPlayer(): AudioPlayer {
    return this.audioPlayer;
  }

  /**
   * Clean up and dispose of all resources
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('Already disposed');
      return;
    }

    this.logger.info('Disposing CompositeVoice SDK');

    try {
      // Stop any active operations
      if (this.stateMachine.is('listening')) {
        await this.stopListening();
      }
      if (this.stateMachine.is('speaking')) {
        await this.stopSpeaking();
      }

      // Dispose providers
      if (this.config.mode === 'composite') {
        await Promise.all([
          this.config.stt.dispose(),
          this.config.llm.dispose(),
          this.config.tts.dispose(),
        ]);
      } else if (this.config.mode === 'all-in-one') {
        await this.config.provider.dispose();
      }

      // Dispose audio components
      await this.audioCapture.stop();
      await this.audioPlayer.dispose();

      // Clear event listeners
      this.events.removeAllListeners();

      // Reset state
      this.stateMachine.reset();
      this.initialized = false;

      this.logger.info('CompositeVoice SDK disposed');
    } catch (error) {
      this.logger.error('Error disposing SDK', error);
      throw error;
    }
  }
}
