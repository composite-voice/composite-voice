/**
 * Tests for TurnTakingController — turn-taking decision collaborator.
 */

import { TurnTakingController } from '../../../../src/core/collaborators/TurnTakingController';
import type { STTProvider, TTSProvider } from '../../../../src/core/types/providers';
import { Logger } from '../../../../src/utils/logger';

// ── Minimal mock providers ─────────────────────────────────────────────────────

function makeSTT(name: string): STTProvider {
  const provider = {
    type: 'websocket' as const,
    roles: ['stt'] as const,
    config: {},
    initialize: jest.fn(),
    dispose: jest.fn(),
    isReady: jest.fn().mockReturnValue(true),
    connect: jest.fn(),
    sendAudio: jest.fn(),
    disconnect: jest.fn(),
    onTranscription: jest.fn(),
  };
  return Object.setPrototypeOf(provider, { constructor: { name } });
}

function makeTTS(name: string): TTSProvider {
  const provider = {
    type: 'rest' as const,
    roles: ['tts'] as const,
    config: {},
    initialize: jest.fn(),
    dispose: jest.fn(),
    isReady: jest.fn().mockReturnValue(true),
    synthesize: jest.fn(),
  };
  return Object.setPrototypeOf(provider, { constructor: { name } });
}

// Mock navigator.mediaDevices for detect strategy
const mockGetSupportedConstraints = jest.fn().mockReturnValue({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});

// Create a mock logger for the controller
const mockLogger = new Logger('TurnTakingControllerTest', { enabled: false });

describe('TurnTakingController', () => {
  beforeEach(() => {
    (global.navigator.mediaDevices as any).getSupportedConstraints = mockGetSupportedConstraints;
  });

  describe('constructor', () => {
    it('creates an instance with config and logger', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
        mockLogger,
      );
      expect(controller).toBeInstanceOf(TurnTakingController);
    });

    it('applies defaults when config is undefined', () => {
      const controller = new TurnTakingController(undefined, mockLogger);
      // Verify defaults are applied by testing shouldPause behavior
      // Default: pauseCaptureOnPlayback='auto', autoStrategy='conservative'
      // NativeSTT uses speechrecognition => conservative pauses
      expect(controller.shouldPause(makeSTT('NativeSTT'), makeTTS('NativeTTS'))).toBe(true);
      // DeepgramSTT uses mediadevices => conservative does not pause
      expect(controller.shouldPause(makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))).toBe(false);
    });

    it('merges provided config over defaults', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: true },
        mockLogger,
      );
      // Explicit true overrides auto behavior
      expect(controller.shouldPause(makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))).toBe(true);
    });
  });

  describe('shouldPause', () => {
    it('returns true when pauseCaptureOnPlayback is explicitly true', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: true },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))).toBe(true);
    });

    it('returns false when pauseCaptureOnPlayback is explicitly false', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: false },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('NativeSTT'), makeTTS('NativeTTS'))).toBe(false);
    });

    it('returns true for NativeSTT with conservative auto strategy', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('NativeSTT'), makeTTS('NativeTTS'))).toBe(true);
    });

    it('returns false for DeepgramSTT with conservative auto strategy', () => {
      const controller = new TurnTakingController(
        { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))).toBe(false);
    });

    it('uses aggressive strategy with alwaysPauseCombinations', () => {
      const controller = new TurnTakingController(
        {
          pauseCaptureOnPlayback: 'auto',
          autoStrategy: 'aggressive',
          alwaysPauseCombinations: [{ stt: 'NativeSTT', tts: 'any' }],
        },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('NativeSTT'), makeTTS('DeepgramTTS'))).toBe(true);
    });

    it('returns false for non-matching aggressive combinations', () => {
      const controller = new TurnTakingController(
        {
          pauseCaptureOnPlayback: 'auto',
          autoStrategy: 'aggressive',
          alwaysPauseCombinations: [{ stt: 'NativeSTT', tts: 'NativeTTS' }],
        },
        mockLogger,
      );
      expect(controller.shouldPause(makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))).toBe(false);
    });
  });
});
