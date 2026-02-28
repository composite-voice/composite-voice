/**
 * NativeTTS provider unit tests
 */

import { NativeTTS } from '../../../../src/providers/tts/native/NativeTTS';

// ---- Mock SpeechSynthesis ----

function makeMockVoice(name: string, lang: string, localService = true) {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

const mockVoices = [
  makeMockVoice('Google US English', 'en-US', false),
  makeMockVoice('Alex', 'en-US', true),
  makeMockVoice('Amélie', 'fr-FR', true),
];

let mockUtterance: {
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  text?: string;
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  lang?: string;
} = {
  onstart: null,
  onend: null,
  onerror: null,
};

const MockSpeechSynthesisUtterance = jest.fn().mockImplementation((text: string) => {
  mockUtterance = {
    onstart: null,
    onend: null,
    onerror: null,
    text,
    voice: null,
    rate: 1,
    pitch: 1,
    lang: '',
  };
  return mockUtterance;
});

const mockSynthesis = {
  speaking: false,
  paused: false,
  pending: false,
  onvoiceschanged: null as (() => void) | null,
  getVoices: jest.fn().mockReturnValue(mockVoices),
  speak: jest.fn().mockImplementation(() => {
    // Auto-resolve speech after a microtask
    Promise.resolve().then(() => mockUtterance.onend?.());
  }),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
};

describe('NativeTTS', () => {
  let provider: NativeTTS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUtterance = { onstart: null, onend: null, onerror: null };
    mockSynthesis.getVoices.mockReturnValue(mockVoices);
    mockSynthesis.speak.mockImplementation(() => {
      Promise.resolve().then(() => mockUtterance.onend?.());
    });

    // Install browser mocks on global
    (global as any).window = { speechSynthesis: mockSynthesis };
    (global as any).speechSynthesis = mockSynthesis;
    (global as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

    provider = new NativeTTS();
  });

  afterEach(async () => {
    if (provider?.isReady()) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('should declare tts and output roles', () => {
      expect(provider.roles).toEqual(['tts', 'output']);
    });

    it('should set type to rest', () => {
      expect(provider.type).toBe('rest');
    });

    it('should apply default config values', () => {
      expect(provider.config.rate).toBe(1.0);
      expect(provider.config.preferLocal).toBe(true);
    });

    it('should initialize and load voices', async () => {
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      expect(provider.getAvailableVoices()).toHaveLength(3);
    });

    it('should prefer local voice by default', async () => {
      await provider.initialize();
      const selected = provider.getSelectedVoice();
      expect(selected?.localService).toBe(true);
    });

    it('should select voice by name when specified', async () => {
      const p = new NativeTTS({ voiceName: 'Amélie' });
      await p.initialize();
      expect(p.getSelectedVoice()?.name).toBe('Amélie');
      await p.dispose();
    });

    it('should select voice by language when specified', async () => {
      const p = new NativeTTS({ voiceLang: 'fr' });
      await p.initialize();
      expect(p.getSelectedVoice()?.lang).toMatch(/^fr/);
      await p.dispose();
    });

    it('should wait for onvoiceschanged when voices are not immediately available', async () => {
      mockSynthesis.getVoices.mockReturnValue([]);
      const p = new NativeTTS();

      // Start initialization (will register onvoiceschanged)
      const initPromise = p.initialize();

      // Simulate browser firing voiceschanged
      mockSynthesis.getVoices.mockReturnValue(mockVoices);
      mockSynthesis.onvoiceschanged?.();

      await initPromise;
      expect(p.getAvailableVoices()).toHaveLength(3);
      await p.dispose();
    });
  });

  describe('synthesize()', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should call synthesis.speak()', async () => {
      await provider.synthesize('Hello world');
      expect(mockSynthesis.speak).toHaveBeenCalled();
    });

    it('should create utterance with correct text', async () => {
      await provider.synthesize('Test text');
      expect(MockSpeechSynthesisUtterance).toHaveBeenCalledWith('Test text');
    });

    it('should return an empty blob', async () => {
      const result = await provider.synthesize('Hello');
      expect(result).toBeInstanceOf(Blob);
    });

    it('should apply rate from config', async () => {
      const p = new NativeTTS({ rate: 1.5 });
      await p.initialize();
      await p.synthesize('Test');
      expect((mockUtterance as any).rate).toBe(1.5);
      await p.dispose();
    });

    it('should reject when speech errors', async () => {
      mockSynthesis.speak.mockImplementation(() => {
        Promise.resolve().then(() => mockUtterance.onerror?.({ error: 'synthesis-failed' }));
      });
      await expect(provider.synthesize('fail')).rejects.toThrow('synthesis-failed');
    });

    it('should throw if not initialized', async () => {
      const p = new NativeTTS();
      await expect(p.synthesize('Test')).rejects.toThrow();
    });
  });

  describe('voice management', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('setVoice() should return true and update selected voice when found', () => {
      const result = provider.setVoice('Alex');
      expect(result).toBe(true);
      expect(provider.getSelectedVoice()?.name).toBe('Alex');
    });

    it('setVoice() should return false when voice not found', () => {
      const result = provider.setVoice('NonExistentVoice');
      expect(result).toBe(false);
    });

    it('getAvailableVoices() returns a copy', () => {
      const voices = provider.getAvailableVoices();
      voices.push(makeMockVoice('Fake', 'en-US'));
      expect(provider.getAvailableVoices()).toHaveLength(3);
    });
  });

  describe('controls', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('cancel() should call synthesis.cancel()', () => {
      provider.cancel();
      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('pause() should call synthesis.pause()', () => {
      provider.pause();
      expect(mockSynthesis.pause).toHaveBeenCalled();
    });

    it('resume() should call synthesis.resume()', () => {
      provider.resume();
      expect(mockSynthesis.resume).toHaveBeenCalled();
    });

    it('isSpeaking() reflects synthesis.speaking', () => {
      mockSynthesis.speaking = true;
      expect(provider.isSpeaking()).toBe(true);
      mockSynthesis.speaking = false;
      expect(provider.isSpeaking()).toBe(false);
    });

    it('isPaused() reflects synthesis.paused', () => {
      mockSynthesis.paused = true;
      expect(provider.isPaused()).toBe(true);
      mockSynthesis.paused = false;
      expect(provider.isPaused()).toBe(false);
    });
  });

  describe('AudioOutputProvider interface', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('configure() should be a no-op and not throw', () => {
      expect(() =>
        provider.configure({
          sampleRate: 24000,
          encoding: 'linear16',
          channels: 1,
          bitDepth: 16,
        })
      ).not.toThrow();
    });

    it('enqueue() should be a no-op and not throw', () => {
      expect(() =>
        provider.enqueue({
          data: new ArrayBuffer(100),
          timestamp: Date.now(),
        })
      ).not.toThrow();
    });

    it('flush() should resolve immediately', async () => {
      await expect(provider.flush()).resolves.toBeUndefined();
    });

    it('stop() should delegate to cancel()', () => {
      provider.stop();
      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    it('isPlaying() should delegate to isSpeaking()', () => {
      mockSynthesis.speaking = true;
      expect(provider.isPlaying()).toBe(true);
      mockSynthesis.speaking = false;
      expect(provider.isPlaying()).toBe(false);
    });

    it('onPlaybackStart() should register callback fired on utterance start', async () => {
      const callback = jest.fn();
      provider.onPlaybackStart(callback);

      // Modify speak mock to fire onstart then onend
      mockSynthesis.speak.mockImplementation(() => {
        Promise.resolve().then(() => {
          mockUtterance.onstart?.();
          mockUtterance.onend?.();
        });
      });

      await provider.synthesize('Hello');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('onPlaybackEnd() should register callback fired on utterance end', async () => {
      const callback = jest.fn();
      provider.onPlaybackEnd(callback);

      await provider.synthesize('Hello');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('onPlaybackError() should register callback fired on utterance error', async () => {
      const errorCallback = jest.fn();
      provider.onPlaybackError(errorCallback);

      mockSynthesis.speak.mockImplementation(() => {
        Promise.resolve().then(() =>
          mockUtterance.onerror?.({ error: 'synthesis-failed' })
        );
      });

      await expect(provider.synthesize('fail')).rejects.toThrow();
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('synthesis-failed') })
      );
    });
  });

  describe('disposal', () => {
    it('should dispose and cancel speech', async () => {
      await provider.initialize();
      await provider.dispose();
      expect(mockSynthesis.cancel).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});
