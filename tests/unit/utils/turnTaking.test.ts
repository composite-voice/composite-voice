/**
 * Turn-taking utility tests
 */

import {
  shouldPauseCaptureOnPlayback,
  explainTurnTakingDecision,
} from '../../../src/utils/turnTaking';
import type { TurnTakingConfig } from '../../../src/core/types/config';
import type { STTProvider, TTSProvider } from '../../../src/core/types/providers';

// ---- Minimal mock providers ----

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
  Object.defineProperty(provider, 'constructor', {
    value: { name },
    configurable: true,
  });
  // The utility uses provider.constructor.name
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

describe('shouldPauseCaptureOnPlayback', () => {
  beforeEach(() => {
    // Same pattern as AudioCapture.test.ts — assign to existing writable property
    (global.navigator.mediaDevices as any).getSupportedConstraints = mockGetSupportedConstraints;
  });

  describe('explicit configuration', () => {
    it('should return true when pauseCaptureOnPlayback is true', () => {
      const config: TurnTakingConfig = { pauseCaptureOnPlayback: true };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('A'), makeTTS('B'))).toBe(true);
    });

    it('should return false when pauseCaptureOnPlayback is false', () => {
      const config: TurnTakingConfig = { pauseCaptureOnPlayback: false };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('A'), makeTTS('B'))).toBe(false);
    });
  });

  describe('auto strategy: conservative', () => {
    const config: TurnTakingConfig = {
      pauseCaptureOnPlayback: 'auto',
      autoStrategy: 'conservative',
    };

    it('should pause for NativeSTT (uses SpeechRecognition, no echo cancellation)', () => {
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('Any'))).toBe(true);
    });

    it('should NOT pause for DeepgramSTT (uses MediaDevices, has echo cancellation)', () => {
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))).toBe(
        false
      );
    });

    it('should pause for unknown STT providers (no echo cancellation entry)', () => {
      // Unknown providers default to no echo cancellation → should pause
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('UnknownSTT'), makeTTS('Any'))).toBe(
        true
      );
    });
  });

  describe('auto strategy: aggressive', () => {
    const config: TurnTakingConfig = {
      pauseCaptureOnPlayback: 'auto',
      autoStrategy: 'aggressive',
      alwaysPauseCombinations: [
        { stt: 'NativeSTT', tts: 'any' },
        { stt: 'CustomSTT', tts: 'DeepgramTTS' },
      ],
    };

    it('should pause for NativeSTT + any TTS', () => {
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('NativeTTS'))).toBe(
        true
      );
    });

    it('should pause for CustomSTT + DeepgramTTS', () => {
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('CustomSTT'), makeTTS('DeepgramTTS'))
      ).toBe(true);
    });

    it('should NOT pause for DeepgramSTT + DeepgramTTS (not in list)', () => {
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))
      ).toBe(false);
    });

    it('should NOT pause when alwaysPauseCombinations is empty', () => {
      const noComboConfig: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        alwaysPauseCombinations: [],
      };
      expect(
        shouldPauseCaptureOnPlayback(noComboConfig, makeSTT('NativeSTT'), makeTTS('NativeTTS'))
      ).toBe(false);
    });
  });

  describe('auto strategy: detect', () => {
    it('should pause for NativeSTT regardless of browser support (SpeechRecognition has no EC)', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('Any'))).toBe(true);
    });

    it('should NOT pause for DeepgramSTT when browser supports echo cancellation', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))).toBe(
        false
      );
    });

    it('should pause for DeepgramSTT when browser lacks echo cancellation support', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: false,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))).toBe(
        true
      );
    });
  });

  describe('default/unknown strategy', () => {
    it('should default to pausing for unknown strategies', () => {
      const config = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'nonexistent',
      } as unknown as TurnTakingConfig;
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('A'), makeTTS('B'))).toBe(true);
    });
  });
});

describe('explainTurnTakingDecision', () => {
  it('should explain explicit true configuration', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: true },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      true
    );
    expect(result).toContain('PAUSE');
    expect(result).toContain('explicitly');
  });

  it('should explain explicit false configuration', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: false },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      false
    );
    expect(result).toContain('CONTINUE');
    expect(result).toContain('full-duplex');
  });

  it('should include provider names in auto mode explanation', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
      makeSTT('DeepgramSTT'),
      makeTTS('DeepgramTTS'),
      false
    );
    expect(result).toContain('DeepgramSTT');
    expect(result).toContain('DeepgramTTS');
  });
});
