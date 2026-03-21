/**
 * Tests for resolveProviders — maps a flat provider array to a ResolvedPipeline.
 */

import { resolveProviders } from '../../../../src/core/pipeline/resolveProviders';
import { ConfigurationError } from '../../../../src/utils/errors';
import type { ProviderRole } from '../../../../src/core/types/roles';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';
import type { TranscriptionResult } from '../../../../src/core/types/providers';

// ─── Browser mocks for MicrophoneInput / BrowserAudioOutput defaults ────────
//
// resolveProviders imports MicrophoneInput and BrowserAudioOutput statically
// and may construct them when auto-filling defaults. Their constructors are
// safe (no browser API calls), but the classes exist in browser-only modules,
// so we set up minimal global mocks.

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

// ─── Stub classes ───────────────────────────────────────────────────────────
//
// The duck-type validation checks typeof provider[method] === 'function',
// so stubs must have actual methods. constructor.name must match for
// diagnostics but is not used by the resolution algorithm itself.

/** Stub AudioInputProvider for the 'input' role. */
class StubInput {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['input'];

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  start() {}
  stop() {}
  pause() {}
  resume() {}
  isActive() {
    return false;
  }
  onAudio(_cb: (chunk: AudioChunk) => void) {}
  getMetadata(): AudioMetadata {
    return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
  }
}

/** Stub LiveSTTProvider for the 'stt' role. */
class StubLiveSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async connect() {}
  sendAudio(_chunk: ArrayBuffer) {}
  async disconnect() {}
  onTranscription(_cb: (result: TranscriptionResult) => void) {}
}

/** Stub RestSTTProvider for the 'stt' role. */
class StubRestSTT {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async transcribe(_audio: Blob) {}
  onTranscription(_cb: (result: TranscriptionResult) => void) {}
}

/** Stub LLMProvider for the 'llm' role. */
class StubLLM {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['llm'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async generate(_prompt: string) {
    return {
      async *[Symbol.asyncIterator]() {
        yield 'hello';
      },
    };
  }
  async generateFromMessages() {
    return this.generate('');
  }
}

/** Stub LiveTTSProvider for the 'tts' role. */
class StubLiveTTS {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['tts'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async connect() {}
  sendText(_chunk: string) {}
  async finalize() {}
  async disconnect() {}
  onAudio(_cb: (chunk: AudioChunk) => void) {}
  onMetadata(_cb: (metadata: AudioMetadata) => void) {}
}

/** Stub RestTTSProvider for the 'tts' role. */
class StubRestTTS {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['tts'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async synthesize(_text: string) {
    return new Blob([new ArrayBuffer(0)], { type: 'audio/wav' });
  }
}

/** Stub AudioOutputProvider for the 'output' role. */
class StubOutput {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['output'];

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  configure(_metadata: AudioMetadata) {}
  enqueue(_chunk: AudioChunk) {}
  async flush() {}
  stop() {}
  pause() {}
  resume() {}
  isPlaying() {
    return false;
  }
  onPlaybackStart(_cb: () => void) {}
  onPlaybackEnd(_cb: () => void) {}
  onPlaybackError(_cb: (error: Error) => void) {}
}

/** Stub multi-role provider covering input + stt. */
class StubInputSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['input', 'stt'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  // AudioInputProvider methods
  start() {}
  stop() {}
  pause() {}
  resume() {}
  isActive() {
    return false;
  }
  onAudio(_cb: (chunk: AudioChunk) => void) {}
  getMetadata(): AudioMetadata {
    return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
  }

  // LiveSTTProvider methods
  async connect() {}
  sendAudio(_chunk: ArrayBuffer) {}
  async disconnect() {}
  onTranscription(_cb: (result: TranscriptionResult) => void) {}
}

/** Stub multi-role provider covering tts + output. */
class StubTTSOutput {
  readonly type = 'rest' as const;
  readonly roles: readonly ProviderRole[] = ['tts', 'output'];
  config = { model: 'stub' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  // RestTTSProvider methods
  async synthesize(_text: string) {
    return new Blob([new ArrayBuffer(0)], { type: 'audio/wav' });
  }

  // AudioOutputProvider methods
  configure(_metadata: AudioMetadata) {}
  enqueue(_chunk: AudioChunk) {}
  async flush() {}
  stop() {}
  pause() {}
  resume() {}
  isPlaying() {
    return false;
  }
  onPlaybackStart(_cb: () => void) {}
  onPlaybackEnd(_cb: () => void) {}
  onPlaybackError(_cb: (error: Error) => void) {}
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('resolveProviders', () => {
  describe('valid resolutions', () => {
    it('resolves a 5-provider config with all roles explicit', () => {
      const input = new StubInput();
      const stt = new StubLiveSTT();
      const llm = new StubLLM();
      const tts = new StubLiveTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(tts);
      expect(pipeline.output).toBe(output);
    });

    it('resolves a 3-provider config with multi-role input+stt and tts+output', () => {
      const inputStt = new StubInputSTT();
      const llm = new StubLLM();
      const ttsOutput = new StubTTSOutput();

      const pipeline = resolveProviders([inputStt, llm, ttsOutput]);

      expect(pipeline.input).toBe(inputStt);
      expect(pipeline.stt).toBe(inputStt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(ttsOutput);
      expect(pipeline.output).toBe(ttsOutput);
    });

    it('resolves with REST STT provider', () => {
      const input = new StubInput();
      const stt = new StubRestSTT();
      const llm = new StubLLM();
      const tts = new StubLiveTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.stt).toBe(stt);
    });

    it('resolves with REST TTS provider', () => {
      const input = new StubInput();
      const stt = new StubLiveSTT();
      const llm = new StubLLM();
      const tts = new StubRestTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);

      expect(pipeline.tts).toBe(tts);
    });

    it('resolves with custom STT + LLM, auto-fills NullOutput for tts+output', () => {
      const input = new StubInput();
      const stt = new StubLiveSTT();
      const llm = new StubLLM();

      const pipeline = resolveProviders([input, stt, llm]);

      // tts and output should be the same NullOutput instance
      expect(pipeline.tts).toBe(pipeline.output);
      expect(pipeline.tts.constructor.name).toBe('NullOutput');
    });

    it('resolves with custom LLM + TTS + output, auto-fills NullInput for input+stt', () => {
      const llm = new StubLLM();
      const tts = new StubLiveTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([llm, tts, output]);

      // input and stt should be the same NullInput instance
      expect(pipeline.input).toBe(pipeline.stt);
      expect(pipeline.input.constructor.name).toBe('NullInput');
    });

    it('providers can be passed in any order', () => {
      const output = new StubOutput();
      const llm = new StubLLM();
      const stt = new StubLiveSTT();
      const tts = new StubLiveTTS();
      const input = new StubInput();

      const pipeline = resolveProviders([output, llm, stt, tts, input]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(tts);
      expect(pipeline.output).toBe(output);
    });
  });

  describe('default provider auto-fill', () => {
    it('auto-fills NullInput and NullOutput when only LLM is provided', () => {
      const llm = new StubLLM();

      const pipeline = resolveProviders([llm]);

      expect(pipeline.input).toBe(pipeline.stt);
      expect(pipeline.input.constructor.name).toBe('NullInput');
      expect(pipeline.tts).toBe(pipeline.output);
      expect(pipeline.tts.constructor.name).toBe('NullOutput');
      expect(pipeline.llm).toBe(llm);
    });

    it('auto-fills MicrophoneInput when only input is uncovered (stt is covered)', () => {
      const stt = new StubLiveSTT();
      const llm = new StubLLM();
      const ttsOutput = new StubTTSOutput();

      const pipeline = resolveProviders([stt, llm, ttsOutput]);

      expect(pipeline.input.constructor.name).toBe('MicrophoneInput');
      expect(pipeline.stt).toBe(stt);
    });

    it('does NOT auto-fill when only stt is uncovered (input is covered)', () => {
      const input = new StubInput();
      const llm = new StubLLM();
      const ttsOutput = new StubTTSOutput();

      expect(() => resolveProviders([input, llm, ttsOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, llm, ttsOutput])).toThrow(/stt/);
    });

    it('does NOT auto-fill when only tts is uncovered (output is covered)', () => {
      const inputStt = new StubInputSTT();
      const llm = new StubLLM();
      const output = new StubOutput();

      expect(() => resolveProviders([inputStt, llm, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([inputStt, llm, output])).toThrow(/tts/);
    });

    it('auto-fills BrowserAudioOutput when only output is uncovered (tts is covered)', () => {
      const inputStt = new StubInputSTT();
      const llm = new StubLLM();
      const tts = new StubLiveTTS();

      const pipeline = resolveProviders([inputStt, llm, tts]);

      expect(pipeline.output.constructor.name).toBe('BrowserAudioOutput');
      expect(pipeline.tts).toBe(tts);
    });
  });

  describe('error cases', () => {
    it('auto-fills all defaults with empty array', () => {
      const pipeline = resolveProviders([]);
      expect(pipeline.input.constructor.name).toBe('NullInput');
      expect(pipeline.llm.constructor.name).toBe('AnthropicLLM');
      expect(pipeline.output.constructor.name).toBe('NullOutput');
    });

    it('throws ConfigurationError for null/undefined input', () => {
      expect(() => resolveProviders(null as any)).toThrow(ConfigurationError);
      expect(() => resolveProviders(undefined as any)).toThrow(ConfigurationError);
    });

    it('auto-fills AnthropicLLM when LLM role is missing', () => {
      const inputStt = new StubInputSTT();
      const ttsOutput = new StubTTSOutput();

      const pipeline = resolveProviders([inputStt, ttsOutput]);
      expect(pipeline.llm.constructor.name).toBe('AnthropicLLM');
    });

    it('throws ConfigurationError for duplicate roles naming both providers', () => {
      const stt1 = new StubLiveSTT();
      const stt2 = new StubRestSTT();
      const llm = new StubLLM();

      expect(() => resolveProviders([stt1, stt2, llm])).toThrow(ConfigurationError);
      expect(() => resolveProviders([stt1, stt2, llm])).toThrow(/Duplicate role "stt"/);
      expect(() => resolveProviders([stt1, stt2, llm])).toThrow(/StubLiveSTT/);
      expect(() => resolveProviders([stt1, stt2, llm])).toThrow(/StubRestSTT/);
    });

    it('throws ConfigurationError for duplicate input role', () => {
      const input1 = new StubInput();
      const input2 = new StubInput();
      const llm = new StubLLM();

      expect(() => resolveProviders([input1, input2, llm])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input1, input2, llm])).toThrow(/Duplicate role "input"/);
    });

    it('throws ConfigurationError for provider with no roles', () => {
      const noRoles = {
        type: 'rest' as const,
        roles: [] as readonly ProviderRole[],
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
      };

      expect(() => resolveProviders([noRoles])).toThrow(ConfigurationError);
      expect(() => resolveProviders([noRoles])).toThrow(/declares no roles/);
    });

    it('throws ConfigurationError for provider with an unknown role', () => {
      const badRole = {
        type: 'rest' as const,
        roles: ['sttt'] as unknown as readonly ProviderRole[],
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
      };

      expect(() => resolveProviders([badRole])).toThrow(ConfigurationError);
      expect(() => resolveProviders([badRole])).toThrow(/unknown role "sttt"/);
      expect(() => resolveProviders([badRole])).toThrow(/Valid roles are/);
    });

    it('throws ConfigurationError for provider with a non-string role', () => {
      const numericRole = {
        type: 'rest' as const,
        roles: [42] as unknown as readonly ProviderRole[],
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
      };

      expect(() => resolveProviders([numericRole])).toThrow(ConfigurationError);
      expect(() => resolveProviders([numericRole])).toThrow(/unknown role "42"/);
    });
  });

  describe('duck-type validation', () => {
    it('throws ConfigurationError when input provider is missing required methods', () => {
      const badInput = {
        type: 'rest' as const,
        roles: ['input'] as readonly ProviderRole[],
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
        // Missing: start, stop, pause, resume, isActive, onAudio, getMetadata
      };
      const stt = new StubLiveSTT();
      const llm = new StubLLM();
      const ttsOutput = new StubTTSOutput();

      expect(() => resolveProviders([badInput, stt, llm, ttsOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([badInput, stt, llm, ttsOutput])).toThrow(/does not implement/);
      expect(() => resolveProviders([badInput, stt, llm, ttsOutput])).toThrow(/input/);
    });

    it('throws ConfigurationError when STT provider matches neither REST nor live interface', () => {
      const badSTT = {
        type: 'rest' as const,
        roles: ['stt'] as readonly ProviderRole[],
        config: { model: 'bad' },
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
        // Missing: transcribe/onTranscription (REST) and connect/sendAudio/disconnect/onTranscription (live)
      };
      const input = new StubInput();
      const llm = new StubLLM();
      const ttsOutput = new StubTTSOutput();

      expect(() => resolveProviders([input, badSTT, llm, ttsOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([input, badSTT, llm, ttsOutput])).toThrow(/does not implement/);
      expect(() => resolveProviders([input, badSTT, llm, ttsOutput])).toThrow(/stt/);
    });

    it('throws ConfigurationError when LLM provider is missing required methods', () => {
      const badLLM = {
        type: 'rest' as const,
        roles: ['llm'] as readonly ProviderRole[],
        config: { model: 'bad' },
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
        // Missing: generate, generateFromMessages
      };
      const inputStt = new StubInputSTT();
      const ttsOutput = new StubTTSOutput();

      expect(() => resolveProviders([inputStt, badLLM, ttsOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([inputStt, badLLM, ttsOutput])).toThrow(/does not implement/);
      expect(() => resolveProviders([inputStt, badLLM, ttsOutput])).toThrow(/llm/);
    });

    it('throws ConfigurationError when TTS provider matches neither REST nor live interface', () => {
      const badTTS = {
        type: 'rest' as const,
        roles: ['tts'] as readonly ProviderRole[],
        config: { model: 'bad' },
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
        // Missing: synthesize (REST) and connect/sendText/finalize/disconnect/onAudio/onMetadata (live)
      };
      const inputStt = new StubInputSTT();
      const llm = new StubLLM();
      const output = new StubOutput();

      expect(() => resolveProviders([inputStt, llm, badTTS, output])).toThrow(ConfigurationError);
      expect(() => resolveProviders([inputStt, llm, badTTS, output])).toThrow(/does not implement/);
      expect(() => resolveProviders([inputStt, llm, badTTS, output])).toThrow(/tts/);
    });

    it('throws ConfigurationError when output provider is missing required methods', () => {
      const badOutput = {
        type: 'rest' as const,
        roles: ['output'] as readonly ProviderRole[],
        initialize: async () => {},
        dispose: async () => {},
        isReady: () => true,
        // Missing: configure, enqueue, flush, stop, pause, resume, isPlaying, etc.
      };
      const inputStt = new StubInputSTT();
      const llm = new StubLLM();
      const tts = new StubLiveTTS();

      expect(() => resolveProviders([inputStt, llm, tts, badOutput])).toThrow(ConfigurationError);
      expect(() => resolveProviders([inputStt, llm, tts, badOutput])).toThrow(/does not implement/);
      expect(() => resolveProviders([inputStt, llm, tts, badOutput])).toThrow(/output/);
    });

    it('accepts STT with REST interface (transcribe + onTranscription)', () => {
      const input = new StubInput();
      const stt = new StubRestSTT();
      const llm = new StubLLM();
      const tts = new StubLiveTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);
      expect(pipeline.stt).toBe(stt);
    });

    it('accepts TTS with REST interface (synthesize)', () => {
      const input = new StubInput();
      const stt = new StubLiveSTT();
      const llm = new StubLLM();
      const tts = new StubRestTTS();
      const output = new StubOutput();

      const pipeline = resolveProviders([input, stt, llm, tts, output]);
      expect(pipeline.tts).toBe(tts);
    });
  });
});
