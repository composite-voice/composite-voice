/**
 * Integration tests for the array-based provider configuration.
 *
 * @remarks
 * These tests validate that `resolveProviders()` correctly handles various
 * realistic pipeline configurations using the `providers: [...]` array format.
 * Tests cover:
 *
 * - Full 5-provider browser pipeline (mock input/stt/llm/tts/output)
 * - Mixed browser + server-side (mock input with NullOutput)
 * - Fully server-side (BufferInput + NullOutput)
 * - Error cases: missing roles, duplicate roles, missing interface methods
 *
 * Unlike the unit tests (which use lightweight stubs), these tests use the
 * actual mock providers from `tests/mocks/MockProviders.ts` and real
 * server-side providers (BufferInput, NullOutput) to exercise realistic
 * config patterns.
 */

import { resolveProviders } from '../../src/core/pipeline/resolveProviders';
import { BufferInput } from '../../src/providers/input/BufferInput';
import { NullOutput } from '../../src/providers/output/NullOutput';
import { ConfigurationError } from '../../src/utils/errors';
import type { ProviderRole } from '../../src/core/types/roles';
import {
  MockInputProvider,
  MockOutputProvider,
  MockLLMProvider,
  MockLiveSTTProvider,
  MockSTTProvider,
  MockTTSProvider,
} from '../mocks/MockProviders';

// ─── Browser API mocks for MicrophoneInput/BrowserAudioOutput auto-fill defaults ──

const mockGetUserMedia = jest.fn().mockResolvedValue({
  getTracks: () => [{ stop: jest.fn() }],
});

const MockSpeechRecognition = jest.fn().mockImplementation(() => ({
  lang: '',
  continuous: false,
  interimResults: false,
  maxAlternatives: 1,
  onresult: null,
  onerror: null,
  onend: null,
  onstart: null,
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
}));

const mockSpeechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn().mockReturnValue([]),
  speaking: false,
  paused: false,
  onvoiceschanged: null,
};

const MockSpeechSynthesisUtterance = jest.fn().mockImplementation(() => ({
  onstart: null,
  onend: null,
  onerror: null,
  text: '',
}));

beforeEach(() => {
  (global as any).SpeechRecognition = MockSpeechRecognition;
  (global as any).speechSynthesis = mockSpeechSynthesis;
  (global as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  global.navigator.mediaDevices.getUserMedia = mockGetUserMedia;
});

afterEach(() => {
  delete (global as any).SpeechRecognition;
  delete (global as any).webkitSpeechRecognition;
  delete (global as any).speechSynthesis;
  delete (global as any).SpeechSynthesisUtterance;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Array-based provider configuration', () => {
  describe('5-provider browser pipeline', () => {
    it('resolves [input, stt, llm, tts, output] with all 5 slots explicit', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(tts);
      expect(pipeline.output).toBe(output);
    });

    it('each slot references a distinct provider instance', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      // In a 5-provider config, no two slots share a provider
      expect(Object.is(pipeline.input, pipeline.stt)).toBe(false);
      expect(Object.is(pipeline.tts, pipeline.output)).toBe(false);
    });
  });

  describe('server-side output (MockInput + NullOutput)', () => {
    it('resolves [input, stt, llm, nullOutput] — NullOutput covers tts+output', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nullOutput = new NullOutput();

      const pipeline = resolveProviders([input, stt, llm, nullOutput]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(nullOutput);
      expect(pipeline.output).toBe(nullOutput);
      expect(pipeline.output.constructor.name).toBe('NullOutput');
    });

    it('NullOutput declares tts and output roles', () => {
      const nullOutput = new NullOutput();
      expect(nullOutput.roles).toEqual(['tts', 'output']);
    });
  });

  describe('fully server-side pipeline (BufferInput + NullOutput)', () => {
    it('resolves [bufferInput, stt, llm, nullOutput] for fully server-side', () => {
      const bufferInput = new BufferInput({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nullOutput = new NullOutput();

      const pipeline = resolveProviders([bufferInput, stt, llm, nullOutput]);

      expect(pipeline.input).toBe(bufferInput);
      expect(pipeline.input.constructor.name).toBe('BufferInput');
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(nullOutput);
      expect(pipeline.output).toBe(nullOutput);
      expect(pipeline.output.constructor.name).toBe('NullOutput');
    });

    it('BufferInput declares the input role', () => {
      const bufferInput = new BufferInput({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      expect(bufferInput.roles).toEqual(['input']);
    });

    it('BufferInput passes duck-type validation for AudioInputProvider', () => {
      const bufferInput = new BufferInput({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nullOutput = new NullOutput();

      // Should not throw — BufferInput has all required AudioInputProvider methods
      expect(() => resolveProviders([bufferInput, stt, llm, nullOutput])).not.toThrow();
    });

    it('NullOutput passes duck-type validation for AudioOutputProvider', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nullOutput = new NullOutput();

      // Should not throw — NullOutput covers tts+output
      expect(() => resolveProviders([input, stt, llm, nullOutput])).not.toThrow();
    });
  });

  describe('mixed REST and WebSocket STT variants', () => {
    it('resolves with REST STT provider (MockSTTProvider)', () => {
      const input = new MockInputProvider();
      const stt = new MockSTTProvider(); // REST variant: transcribe + onTranscription
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.stt).toBe(stt);
    });

    it('resolves with live/WebSocket STT provider (MockLiveSTTProvider)', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(); // WebSocket variant: connect/processAudio/disconnect
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.stt).toBe(stt);
    });
  });

  describe('missing role error cases', () => {
    it('auto-fills AnthropicLLM when LLM is missing', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([input, stt, tts, output]);
      expect(pipeline.llm.constructor.name).toBe('AnthropicLLM');
    });

    it('auto-fills MicrophoneInput when only input is uncovered (stt is covered)', () => {
      // stt is covered but input is not — auto-fill MicrophoneInput for the input slot
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([stt, llm, tts, output]);

      expect(pipeline.input.constructor.name).toBe('MicrophoneInput');
      expect(pipeline.stt).toBe(stt);
    });

    it('auto-fills BrowserAudioOutput when only output is uncovered (tts is covered)', () => {
      // tts is covered but output is not — auto-fill BrowserAudioOutput for the output slot
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();

      const pipeline = resolveProviders([input, stt, llm, tts]);

      expect(pipeline.output.constructor.name).toBe('BrowserAudioOutput');
      expect(pipeline.tts).toBe(tts);
    });

    it('auto-fills all defaults with empty providers array', () => {
      const pipeline = resolveProviders([]);
      expect(pipeline.input.constructor.name).toBe('NullInput');
      expect(pipeline.stt.constructor.name).toBe('NullInput');
      expect(pipeline.llm.constructor.name).toBe('AnthropicLLM');
      expect(pipeline.tts.constructor.name).toBe('NullOutput');
      expect(pipeline.output.constructor.name).toBe('NullOutput');
    });
  });

  describe('duplicate role error cases', () => {
    it('throws ConfigurationError naming both providers when STT role is duplicated', () => {
      const input = new MockInputProvider();
      const stt1 = new MockLiveSTTProvider();
      const stt2 = new MockSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input, stt1, stt2, llm, tts, output])).toThrow(
        ConfigurationError
      );
      expect(() => resolveProviders([input, stt1, stt2, llm, tts, output])).toThrow(
        /Duplicate role "stt"/
      );
      expect(() => resolveProviders([input, stt1, stt2, llm, tts, output])).toThrow(
        /MockLiveSTTProvider/
      );
      expect(() => resolveProviders([input, stt1, stt2, llm, tts, output])).toThrow(
        /MockSTTProvider/
      );
    });

    it('throws ConfigurationError naming both providers when LLM role is duplicated', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm1 = new MockLLMProvider();
      const llm2 = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input, stt, llm1, llm2, tts, output])).toThrow(
        ConfigurationError
      );
      expect(() => resolveProviders([input, stt, llm1, llm2, tts, output])).toThrow(
        /Duplicate role "llm"/
      );
      expect(() => resolveProviders([input, stt, llm1, llm2, tts, output])).toThrow(
        /MockLLMProvider/
      );
    });

    it('throws ConfigurationError when input role is duplicated', () => {
      const input1 = new MockInputProvider();
      const input2 = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input1, input2, stt, llm, tts, output])).toThrow(
        ConfigurationError
      );
      expect(() => resolveProviders([input1, input2, stt, llm, tts, output])).toThrow(
        /Duplicate role "input"/
      );
    });

    it('throws ConfigurationError when output role is duplicated', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output1 = new MockOutputProvider();
      const output2 = new MockOutputProvider();

      expect(() => resolveProviders([input, stt, llm, tts, output1, output2])).toThrow(
        ConfigurationError
      );
      expect(() => resolveProviders([input, stt, llm, tts, output1, output2])).toThrow(
        /Duplicate role "output"/
      );
    });
  });

  describe('duck-type validation error cases', () => {
    it('throws ConfigurationError when input provider is missing required methods', () => {
      class BadInput {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = ['input'];
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
        // Missing: start, stop, pause, resume, isActive, onAudio, getMetadata
      }

      const badInput = new BadInput();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([badInput, stt, llm, tts, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([badInput, stt, llm, tts, output])).toThrow(
        /does not implement the required interface/
      );
      expect(() => resolveProviders([badInput, stt, llm, tts, output])).toThrow(/"input"/);
    });

    it('throws ConfigurationError when STT provider matches neither REST nor live interface', () => {
      class BadSTT {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = ['stt'];
        config = { model: 'bad' };
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
        // Missing both REST (transcribe, onTranscription) and live (connect, processAudio, disconnect, onTranscription) methods
      }

      const input = new MockInputProvider();
      const badSTT = new BadSTT();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input, badSTT, llm, tts, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, badSTT, llm, tts, output])).toThrow(
        /does not implement the required interface/
      );
      expect(() => resolveProviders([input, badSTT, llm, tts, output])).toThrow(/"stt"/);
    });

    it('throws ConfigurationError when LLM provider is missing required methods', () => {
      class BadLLM {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = ['llm'];
        config = { model: 'bad' };
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
        // Missing: processMessages, processText
      }

      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const badLLM = new BadLLM();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input, stt, badLLM, tts, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, stt, badLLM, tts, output])).toThrow(
        /does not implement the required interface/
      );
      expect(() => resolveProviders([input, stt, badLLM, tts, output])).toThrow(/"llm"/);
    });

    it('throws ConfigurationError when TTS provider matches neither REST nor live interface', () => {
      class BadTTS {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = ['tts'];
        config = { model: 'bad' };
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
        // Missing both REST (synthesize) and live (connect, processChunk, finalize, disconnect, onAudio, onMetadata)
      }

      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const badTTS = new BadTTS();
      const output = new MockOutputProvider();

      expect(() => resolveProviders([input, stt, llm, badTTS, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, stt, llm, badTTS, output])).toThrow(
        /does not implement the required interface/
      );
      expect(() => resolveProviders([input, stt, llm, badTTS, output])).toThrow(/"tts"/);
    });

    it('throws ConfigurationError when output provider is missing required methods', () => {
      class BadOutput {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = ['output'];
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
        // Missing: configure, enqueue, flush, stop, pause, resume, isPlaying, etc.
      }

      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const badOutput = new BadOutput();

      expect(() => resolveProviders([input, stt, llm, tts, badOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, stt, llm, tts, badOutput])).toThrow(
        /does not implement the required interface/
      );
      expect(() => resolveProviders([input, stt, llm, tts, badOutput])).toThrow(/"output"/);
    });
  });

  describe('provider array ordering', () => {
    it('resolves correctly regardless of provider order in array', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      // Reverse order
      const pipeline = resolveProviders([output, tts, llm, stt, input]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(tts);
      expect(pipeline.output).toBe(output);
    });

    it('resolves server-side pipeline in any order', () => {
      const bufferInput = new BufferInput({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nullOutput = new NullOutput();

      // Scrambled order — NullOutput covers tts+output
      const pipeline = resolveProviders([nullOutput, llm, bufferInput, stt]);

      expect(pipeline.input).toBe(bufferInput);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(nullOutput);
      expect(pipeline.output).toBe(nullOutput);
    });
  });

  describe('provider with no roles', () => {
    it('throws ConfigurationError for provider declaring empty roles array', () => {
      class NoRoles {
        readonly type = 'rest' as const;
        readonly roles: readonly ProviderRole[] = [];
        async initialize() {}
        async dispose() {}
        isReady() {
          return true;
        }
      }

      expect(() => resolveProviders([new NoRoles()])).toThrow(ConfigurationError);
      expect(() => resolveProviders([new NoRoles()])).toThrow(/declares no roles/);
    });
  });
});
