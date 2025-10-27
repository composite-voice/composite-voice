/**
 * Native browser TTS provider using Web Speech API
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';

/**
 * Native TTS provider configuration
 */
export interface NativeTTSConfig extends TTSProviderConfig {
  /** Voice name or URI */
  voiceName?: string;
  /** Voice language */
  voiceLang?: string;
  /** Prefer local voices */
  preferLocal?: boolean;
}

/**
 * Native browser TTS provider
 * Uses the Web Speech API (SpeechSynthesis)
 * Browser plays audio directly - CompositeVoice does NOT receive audio
 */
export class NativeTTS extends RestTTSProvider {
  declare public config: NativeTTSConfig;
  private synthesis: SpeechSynthesis;
  private availableVoices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor(config: Partial<NativeTTSConfig> = {}, logger?: Logger) {
    const voiceValue = config.voice ?? config.voiceName ?? 'default';
    super(
      {
        voice: voiceValue,
        rate: config.rate ?? 1.0,
        pitch: config.pitch ?? 0, // Will be normalized to 0-2 range
        voiceLang: config.voiceLang,
        preferLocal: config.preferLocal ?? true,
        ...config,
      },
      logger
    );
    this.synthesis = window.speechSynthesis;
  }

  protected async onInitialize(): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech Synthesis API is not supported in this browser');
    }

    // Load available voices
    await this.loadVoices();

    // Select voice
    this.selectVoice();

    this.logger.info('Native TTS initialized', {
      availableVoices: this.availableVoices.length,
      selectedVoice: this.selectedVoice?.name,
    });
  }

  protected async onDispose(): Promise<void> {
    // Cancel any ongoing speech
    this.synthesis.cancel();
  }

  /**
   * Load available voices
   */
  private async loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      // Voices might be loaded already
      let voices = this.synthesis.getVoices();

      if (voices.length > 0) {
        this.availableVoices = voices;
        resolve();
        return;
      }

      // Wait for voices to be loaded
      this.synthesis.onvoiceschanged = () => {
        voices = this.synthesis.getVoices();
        this.availableVoices = voices;
        resolve();
      };

      // Fallback timeout
      setTimeout(() => {
        this.availableVoices = this.synthesis.getVoices();
        resolve();
      }, 1000);
    });
  }

  /**
   * Select appropriate voice based on configuration
   */
  private selectVoice(): void {
    if (this.availableVoices.length === 0) {
      this.logger.warn('No voices available');
      return;
    }

    // Try to find voice by name
    if (this.config.voice) {
      const voiceToFind = this.config.voice;
      const voiceByName = this.availableVoices.find(
        (v) => v.name === voiceToFind || v.name.toLowerCase().includes(voiceToFind.toLowerCase())
      );
      if (voiceByName) {
        this.selectedVoice = voiceByName;
        this.logger.info(`Selected voice by name: ${voiceByName.name}`);
        return;
      }
    }

    // Try to find voice by language
    if (this.config.voiceLang) {
      const langToFind = this.config.voiceLang;
      const voiceByLang = this.availableVoices.find((v) => v.lang.startsWith(langToFind));
      if (voiceByLang) {
        this.selectedVoice = voiceByLang;
        this.logger.info(`Selected voice by language: ${voiceByLang.name}`);
        return;
      }
    }

    // Prefer local voices if configured
    if (this.config.preferLocal) {
      const localVoice = this.availableVoices.find((v) => v.localService);
      if (localVoice) {
        this.selectedVoice = localVoice;
        this.logger.info(`Selected local voice: ${localVoice.name}`);
        return;
      }
    }

    // Fallback to first available voice
    this.selectedVoice = this.availableVoices[0] ?? null;
    this.logger.info(`Selected default voice: ${this.selectedVoice?.name}`);
  }

  /**
   * Synthesize text to speech (REST-style, but plays immediately)
   * 
   * Note: Native TTS uses SpeechSynthesis API which directly plays to speakers.
   * Audio flow: Text → SpeechSynthesis.speak() → Speakers
   * This provider does NOT emit audio via onAudio() callbacks.
   * 
   * @param text Text to synthesize
   * @returns Empty Blob (audio is played directly by browser, cannot be captured)
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      utterance.rate = this.config.rate ?? 1.0;

      // Convert pitch from semitones (-20 to 20) to Web Speech range (0 to 2)
      const pitch = this.config.pitch ?? 0;
      utterance.pitch = Math.max(0, Math.min(2, 1 + pitch / 20));

      utterance.onend = () => {
        this.logger.debug('Speech finished');
        // Note: Web Speech API doesn't provide audio data
        // Return empty blob as we can't capture the audio
        resolve(new Blob());
      };

      utterance.onerror = (event) => {
        this.logger.error('Speech error', event);
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.synthesis.speak(utterance);
    });
  }

  /**
   * Cancel ongoing speech
   */
  cancel(): void {
    this.synthesis.cancel();
    this.logger.info('Speech cancelled');
  }

  /**
   * Pause ongoing speech
   */
  pause(): void {
    this.synthesis.pause();
    this.logger.info('Speech paused');
  }

  /**
   * Resume paused speech
   */
  resume(): void {
    this.synthesis.resume();
    this.logger.info('Speech resumed');
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  /**
   * Check if speech is paused
   */
  isPaused(): boolean {
    return this.synthesis.paused;
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return [...this.availableVoices];
  }

  /**
   * Get currently selected voice
   */
  getSelectedVoice(): SpeechSynthesisVoice | null {
    return this.selectedVoice;
  }

  /**
   * Set voice by name
   */
  setVoice(voiceName: string): boolean {
    const voice = this.availableVoices.find(
      (v) => v.name === voiceName || v.name.toLowerCase().includes(voiceName.toLowerCase())
    );

    if (voice) {
      this.selectedVoice = voice;
      this.config.voice = voiceName;
      this.logger.info(`Voice changed to: ${voice.name}`);
      return true;
    }

    this.logger.warn(`Voice not found: ${voiceName}`);
    return false;
  }
}
