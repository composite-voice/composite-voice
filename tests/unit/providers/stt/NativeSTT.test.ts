/**
 * NativeSTT provider unit tests
 */

import { NativeSTT } from '../../../../src/providers/stt/native/NativeSTT';

// ---- Mock SpeechRecognition ----

type SpeechRecognitionEventHandler = ((event: Event) => void) | null;
type ResultHandler = ((event: Record<string, unknown>) => void) | null;
type ErrorHandler = ((event: { error: string; message: string }) => void) | null;

function makeMockRecognition() {
  return {
    lang: '',
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    onresult: null as ResultHandler,
    onerror: null as ErrorHandler,
    onend: null as SpeechRecognitionEventHandler,
    onstart: null as SpeechRecognitionEventHandler,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  };
}

let mockRecognition = makeMockRecognition();
const MockSpeechRecognition = jest.fn().mockImplementation(() => mockRecognition);

// Mock getUserMedia
const mockGetUserMedia = jest.fn().mockResolvedValue({
  getTracks: () => [{ stop: jest.fn() }],
});

describe('NativeSTT', () => {
  let provider: NativeSTT;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRecognition = makeMockRecognition();
    MockSpeechRecognition.mockImplementation(() => mockRecognition);

    // In JSDOM, `window` IS the global object.  Set properties on `global` directly.
    (global as any).SpeechRecognition = MockSpeechRecognition;
    delete (global as any).webkitSpeechRecognition;

    // Mock getUserMedia — JSDOM exposes mediaDevices but the property itself is configurable
    // only via assignment on the object directly (same pattern as AudioCapture.test.ts)
    global.navigator.mediaDevices.getUserMedia = mockGetUserMedia;

    provider = new NativeSTT();
  });

  afterEach(() => {
    delete (global as any).SpeechRecognition;
    delete (global as any).webkitSpeechRecognition;
  });

  afterEach(async () => {
    if (provider?.isReady()) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('should set managedAudio to true', () => {
      expect(provider.managedAudio).toBe(true);
    });

    it('should set type to websocket', () => {
      expect(provider.type).toBe('websocket');
    });

    it('should apply default config values', () => {
      expect(provider.config.language).toBe('en-US');
      expect(provider.config.interimResults).toBe(true);
      expect(provider.config.continuous).toBe(true);
      expect(provider.config.maxAlternatives).toBe(1);
    });

    it('should accept custom config', () => {
      const custom = new NativeSTT({
        language: 'fr-FR',
        continuous: false,
        maxAlternatives: 3,
      });
      expect(custom.config.language).toBe('fr-FR');
      expect(custom.config.continuous).toBe(false);
      expect(custom.config.maxAlternatives).toBe(3);
    });

    it('should initialize successfully when SpeechRecognition is available', async () => {
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      expect(MockSpeechRecognition).toHaveBeenCalled();
    });

    it('should set recognition properties from config', async () => {
      const p = new NativeSTT({ language: 'es-ES', continuous: false, maxAlternatives: 2 });
      await p.initialize();
      expect(mockRecognition.lang).toBe('es-ES');
      expect(mockRecognition.continuous).toBe(false);
      expect(mockRecognition.maxAlternatives).toBe(2);
      await p.dispose();
    });

    it('should throw when Web Speech API is not available', async () => {
      delete (global as any).SpeechRecognition;
      delete (global as any).webkitSpeechRecognition;
      // Wrapped in ProviderInitializationError by base class
      await expect(provider.initialize()).rejects.toThrow('Failed to initialize provider: NativeSTT');
    });

    it('should fall back to webkitSpeechRecognition', async () => {
      delete (global as any).SpeechRecognition;
      (global as any).webkitSpeechRecognition = MockSpeechRecognition;
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });
  });

  describe('connect()', () => {
    beforeEach(async () => {
      await provider.initialize();
      // Auto-fire onstart when start() is called
      mockRecognition.start.mockImplementation(() => {
        Promise.resolve().then(() => mockRecognition.onstart?.(new Event('start')));
      });
    });

    it('should call recognition.start()', async () => {
      await provider.connect();
      expect(mockRecognition.start).toHaveBeenCalled();
    });

    it('should check microphone permission', async () => {
      await provider.connect();
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should throw ProviderConnectionError when permission is denied', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
      await expect(provider.connect()).rejects.toThrow('Failed to connect to provider: NativeSTT');
    });

    it('should reject after startTimeout if onstart never fires', async () => {
      const fastProvider = new NativeSTT({ startTimeout: 50 });
      await fastProvider.initialize();
      // Don't fire onstart
      mockRecognition.start.mockImplementation(() => {});

      // Error message is wrapped in ProviderConnectionError
      await expect(fastProvider.connect()).rejects.toThrow('Failed to connect to provider: NativeSTT');
      await fastProvider.dispose();
    }, 1000);

    it('should handle "already started" error gracefully', async () => {
      mockRecognition.start.mockImplementation(() => {
        throw new Error('recognition has already started');
      });

      await expect(provider.connect()).resolves.not.toThrow();
    });

    it('should reject on unexpected start error', async () => {
      mockRecognition.start.mockImplementation(() => {
        throw new Error('Unknown error');
      });

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('disconnect()', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should call recognition.stop()', async () => {
      await provider.disconnect();
      expect(mockRecognition.stop).toHaveBeenCalled();
    });

    it('should not throw if recognition.stop() throws', async () => {
      mockRecognition.stop.mockImplementation(() => {
        throw new Error('Already stopped');
      });
      await expect(provider.disconnect()).resolves.not.toThrow();
    });
  });

  describe('sendAudio()', () => {
    it('should be a no-op and not throw', async () => {
      await provider.initialize();
      expect(() => provider.sendAudio(new ArrayBuffer(100))).not.toThrow();
    });
  });

  describe('onTranscription callback', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should receive transcription results via callback', () => {
      const callback = jest.fn();
      provider.onTranscription(callback);

      // Simulate a result event
      const fakeEvent = {
        resultIndex: 0,
        results: {
          length: 1,
          item: () => ({
            isFinal: true,
            length: 1,
            item: () => ({ transcript: 'Hello world', confidence: 0.95 }),
            0: { transcript: 'Hello world', confidence: 0.95 },
          }),
          0: {
            isFinal: true,
            length: 1,
            item: () => ({ transcript: 'Hello world', confidence: 0.95 }),
            0: { transcript: 'Hello world', confidence: 0.95 },
          },
        },
      };

      mockRecognition.onresult?.(fakeEvent as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: true,
          confidence: 0.95,
        })
      );
    });

    it('should emit interim results', () => {
      const callback = jest.fn();
      provider.onTranscription(callback);

      const fakeEvent = {
        resultIndex: 0,
        results: {
          length: 1,
          item: () => ({
            isFinal: false,
            length: 1,
            item: () => ({ transcript: 'Hel', confidence: 0.5 }),
            0: { transcript: 'Hel', confidence: 0.5 },
          }),
          0: {
            isFinal: false,
            length: 1,
            item: () => ({ transcript: 'Hel', confidence: 0.5 }),
            0: { transcript: 'Hel', confidence: 0.5 },
          },
        },
      };

      mockRecognition.onresult?.(fakeEvent as any);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hel',
          isFinal: false,
        })
      );
    });

    it('should map not-allowed error to a helpful message', () => {
      const callback = jest.fn();
      provider.onTranscription(callback);

      mockRecognition.onerror?.({ error: 'not-allowed', message: '' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          metadata: expect.objectContaining({ error: 'not-allowed' }),
        })
      );
    });

    it('should map no-speech error', () => {
      const callback = jest.fn();
      provider.onTranscription(callback);

      mockRecognition.onerror?.({ error: 'no-speech', message: '' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ error: 'no-speech' }),
        })
      );
    });
  });

  describe('disposal', () => {
    it('should dispose without throwing', async () => {
      await provider.initialize();
      await expect(provider.dispose()).resolves.not.toThrow();
      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });
});
