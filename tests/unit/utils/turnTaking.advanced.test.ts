/**
 * Advanced turn-taking utility tests — covers edge cases and
 * explainTurnTakingDecision output format not covered in the base test file.
 */

import {
  shouldPauseCaptureOnPlayback,
  explainTurnTakingDecision,
} from '../../../src/utils/turnTaking';
import type { TurnTakingConfig } from '../../../src/core/types/config';
import type { STTProvider, TTSProvider } from '../../../src/core/types/providers';

// ---- Minimal mock providers (same pattern as base test file) ----

function makeSTT(name: string): STTProvider {
  const provider = {
    type: 'websocket' as const,
    roles: ['stt'] as const,
    config: {},
    initialize: jest.fn(),
    dispose: jest.fn(),
    isReady: jest.fn().mockReturnValue(true),
    connect: jest.fn(),
    processAudio: jest.fn(),
    disconnect: jest.fn(),
    onTranscription: jest.fn(),
  };
  Object.defineProperty(provider, 'constructor', {
    value: { name },
    configurable: true,
  });
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

describe('shouldPauseCaptureOnPlayback — advanced scenarios', () => {
  beforeEach(() => {
    (global.navigator.mediaDevices as any).getSupportedConstraints = mockGetSupportedConstraints;
  });

  describe('conservative strategy with all known providers', () => {
    const config: TurnTakingConfig = {
      pauseCaptureOnPlayback: 'auto',
      autoStrategy: 'conservative',
    };

    it('should pause for NativeSTT + NativeTTS', () => {
      expect(shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('NativeTTS'))).toBe(
        true
      );
    });

    it('should pause for NativeSTT + DeepgramTTS', () => {
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('DeepgramTTS'))
      ).toBe(true);
    });

    it('should pause for DeepgramSTT + NativeTTS (NativeTTS bypasses echo cancellation)', () => {
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('NativeTTS'))
      ).toBe(true);
    });

    it('should NOT pause for DeepgramSTT + DeepgramTTS', () => {
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('DeepgramTTS'))
      ).toBe(false);
    });
  });

  describe('aggressive strategy with wildcard matching', () => {
    it('should pause when TTS wildcard matches any TTS provider', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        alwaysPauseCombinations: [{ stt: 'NativeSTT', tts: 'any' }],
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('SomeTTS'))
      ).toBe(true);
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('AnyOtherTTS'))
      ).toBe(true);
    });

    it('should pause when STT wildcard matches any STT provider', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        alwaysPauseCombinations: [{ stt: 'any', tts: 'NativeTTS' }],
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('SomeSTT'), makeTTS('NativeTTS'))
      ).toBe(true);
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('AnyOtherSTT'), makeTTS('NativeTTS'))
      ).toBe(true);
    });

    it('should pause when both wildcards match everything', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        alwaysPauseCombinations: [{ stt: 'any', tts: 'any' }],
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('Whatever'), makeTTS('Anything'))
      ).toBe(true);
    });

    it('should NOT pause when no combinations are defined', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        // alwaysPauseCombinations undefined
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('NativeSTT'), makeTTS('NativeTTS'))
      ).toBe(false);
    });

    it('should match multiple combinations independently', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'aggressive',
        alwaysPauseCombinations: [
          { stt: 'AlphaSTT', tts: 'BetaTTS' },
          { stt: 'GammaSTT', tts: 'DeltaTTS' },
        ],
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('AlphaSTT'), makeTTS('BetaTTS'))
      ).toBe(true);
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('GammaSTT'), makeTTS('DeltaTTS'))
      ).toBe(true);
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('AlphaSTT'), makeTTS('DeltaTTS'))
      ).toBe(false);
    });
  });

  describe('detect strategy edge cases', () => {
    it('should pause when getSupportedConstraints returns empty object', () => {
      mockGetSupportedConstraints.mockReturnValue({});
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))
      ).toBe(true);
    });

    it('should pause when echoCancellation is true but noiseSuppression is false', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))
      ).toBe(true);
    });

    it('should pause when autoGainControl is false', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))
      ).toBe(true);
    });

    it('should NOT pause when all three constraints are supported', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('DeepgramSTT'), makeTTS('Any'))
      ).toBe(false);
    });
  });

  describe('unknown and empty provider names', () => {
    it('conservative: should pause for unknown STT provider name', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'conservative',
      };
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('CompletelyUnknownSTT'), makeTTS('Any'))
      ).toBe(true);
    });

    it('conservative: should pause for empty STT provider name', () => {
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'conservative',
      };
      expect(shouldPauseCaptureOnPlayback(config, makeSTT(''), makeTTS('Any'))).toBe(true);
    });

    it('detect: should pause for unknown STT provider (not in PROVIDER_CAPTURE_METHOD)', () => {
      mockGetSupportedConstraints.mockReturnValue({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      const config: TurnTakingConfig = {
        pauseCaptureOnPlayback: 'auto',
        autoStrategy: 'detect',
      };
      // Unknown providers don't match 'speechrecognition', but also don't match 'mediadevices'
      // so they won't enter the speechrecognition early-return but will check browser support.
      // Since getSupportedConstraints returns all true, and unknown providers would pass
      // the "not speechrecognition" check, they'd evaluate browser support.
      // The function checks PROVIDER_CAPTURE_METHOD[providerName] === 'speechrecognition'
      // for unknown providers this is undefined !== 'speechrecognition' -> false
      // So it proceeds to check browser support, which returns true -> hasEC=true -> shouldPause=false
      expect(
        shouldPauseCaptureOnPlayback(config, makeSTT('UnknownProvider'), makeTTS('Any'))
      ).toBe(false);
    });
  });
});

describe('explainTurnTakingDecision — output format', () => {
  it('should include "PAUSE" and "explicitly" for explicit true', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: true },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      true
    );
    expect(result).toContain('PAUSE');
    expect(result).toContain('explicitly');
    expect(result).not.toContain('auto');
  });

  it('should include "CONTINUE" and "full-duplex" for explicit false', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: false },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      false
    );
    expect(result).toContain('CONTINUE');
    expect(result).toContain('full-duplex');
    expect(result).not.toContain('auto');
  });

  it('should include strategy name for auto mode', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      true
    );
    expect(result).toContain('auto mode');
    expect(result).toContain('conservative');
  });

  it('should include both provider names in auto mode', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'aggressive' },
      makeSTT('MyCustomSTT'),
      makeTTS('MyCustomTTS'),
      false
    );
    expect(result).toContain('MyCustomSTT');
    expect(result).toContain('MyCustomTTS');
  });

  it('should include capture method in auto mode', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'detect' },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      true
    );
    expect(result).toContain('speechrecognition');
    expect(result).toContain('not supported');
  });

  it('should report "unknown" capture method for unknown providers', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
      makeSTT('UnknownSTT'),
      makeTTS('UnknownTTS'),
      true
    );
    expect(result).toContain('unknown');
  });

  it('should show CONTINUE when DeepgramSTT has echo cancellation support', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
      makeSTT('DeepgramSTT'),
      makeTTS('DeepgramTTS'),
      false
    );
    expect(result).toContain('CONTINUE');
    expect(result).toContain('mediadevices');
    expect(result).toContain('supported');
  });

  it('should be a multi-line string in auto mode', () => {
    const result = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: 'auto', autoStrategy: 'conservative' },
      makeSTT('NativeSTT'),
      makeTTS('NativeTTS'),
      true
    );
    const lines = result.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Capture will');
    expect(lines[1]).toContain('STT Provider:');
    expect(lines[2]).toContain('TTS Provider:');
  });

  it('should be a single line for explicit configuration', () => {
    const resultTrue = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: true },
      makeSTT('A'),
      makeTTS('B'),
      true
    );
    expect(resultTrue.split('\n').length).toBe(1);

    const resultFalse = explainTurnTakingDecision(
      { pauseCaptureOnPlayback: false },
      makeSTT('A'),
      makeTTS('B'),
      false
    );
    expect(resultFalse.split('\n').length).toBe(1);
  });
});
