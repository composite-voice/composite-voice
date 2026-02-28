/**
 * Integration tests for multi-role provider resolution.
 *
 * @remarks
 * These tests validate that multi-role providers (NativeSTT covering
 * input+stt, NativeTTS covering tts+output) resolve correctly through
 * the {@link resolveProviders} algorithm and produce a pipeline where
 * multi-role slots share the same provider instance.
 *
 * Unlike the unit tests in `resolveProviders.test.ts` (which use lightweight
 * stubs), these tests exercise **real provider classes** (NativeSTT, NativeTTS)
 * with browser API mocks to validate the full integration.
 */

import { resolveProviders } from '../../src/core/pipeline/resolveProviders';
import { NativeSTT } from '../../src/providers/stt/native/NativeSTT';
import { NativeTTS } from '../../src/providers/tts/native/NativeTTS';
import { ConfigurationError } from '../../src/utils/errors';
import {
  MockLLMProvider,
  MockInputProvider,
  MockOutputProvider,
  MockLiveSTTProvider,
  MockTTSProvider,
} from '../mocks/MockProviders';

// ─── Browser API mocks for NativeSTT / NativeTTS ─────────────────────────────

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

describe('Multi-role provider resolution', () => {
  describe('NativeSTT + LLM + NativeTTS (3-provider multi-role)', () => {
    it('resolves NativeSTT into both input and stt slots', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      const pipeline = resolveProviders([nativeSTT, llm, nativeTTS]);

      // NativeSTT should fill both input and stt slots (same instance)
      expect(pipeline.input).toBe(nativeSTT);
      expect(pipeline.stt).toBe(nativeSTT);
      // Verify it's the same object in both slots
      expect(Object.is(pipeline.input, pipeline.stt)).toBe(true);
    });

    it('resolves NativeTTS into both tts and output slots', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      const pipeline = resolveProviders([nativeSTT, llm, nativeTTS]);

      // NativeTTS should fill both tts and output slots (same instance)
      expect(pipeline.tts).toBe(nativeTTS);
      expect(pipeline.output).toBe(nativeTTS);
      // Verify it's the same object in both slots
      expect(Object.is(pipeline.tts, pipeline.output)).toBe(true);
    });

    it('fills all 5 pipeline slots from 3 providers', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      const pipeline = resolveProviders([nativeSTT, llm, nativeTTS]);

      expect(pipeline.input).toBeDefined();
      expect(pipeline.stt).toBeDefined();
      expect(pipeline.llm).toBeDefined();
      expect(pipeline.tts).toBeDefined();
      expect(pipeline.output).toBeDefined();
      expect(pipeline.llm).toBe(llm);
    });

    it('preserves NativeSTT roles declaration', () => {
      const nativeSTT = new NativeSTT();
      expect(nativeSTT.roles).toEqual(['input', 'stt']);
    });

    it('preserves NativeTTS roles declaration', () => {
      const nativeTTS = new NativeTTS();
      expect(nativeTTS.roles).toEqual(['tts', 'output']);
    });
  });

  describe('multi-role with explicit single-role providers', () => {
    it('resolves NativeSTT (input+stt) with explicit output provider', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const tts = new MockTTSProvider();
      const output = new MockOutputProvider();

      const pipeline = resolveProviders([nativeSTT, llm, tts, output]);

      expect(pipeline.input).toBe(nativeSTT);
      expect(pipeline.stt).toBe(nativeSTT);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(tts);
      expect(pipeline.output).toBe(output);
    });

    it('resolves NativeTTS (tts+output) with explicit input provider', () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      const pipeline = resolveProviders([input, stt, llm, nativeTTS]);

      expect(pipeline.input).toBe(input);
      expect(pipeline.stt).toBe(stt);
      expect(pipeline.llm).toBe(llm);
      expect(pipeline.tts).toBe(nativeTTS);
      expect(pipeline.output).toBe(nativeTTS);
    });
  });

  describe('multi-role conflict detection', () => {
    it('throws when NativeSTT conflicts with an explicit input provider', () => {
      const nativeSTT = new NativeSTT();
      const extraInput = new MockInputProvider();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      // NativeSTT claims ['input', 'stt'] — conflict detected on 'input' first
      expect(() =>
        resolveProviders([extraInput, nativeSTT, llm, nativeTTS])
      ).toThrow(ConfigurationError);
      expect(() =>
        resolveProviders([extraInput, nativeSTT, llm, nativeTTS])
      ).toThrow(/Duplicate role "input"/);
    });

    it('throws when NativeTTS conflicts with an explicit output provider', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();
      const extraOutput = new MockOutputProvider();

      // NativeTTS claims 'output', so adding another output provider should fail
      expect(() =>
        resolveProviders([nativeSTT, llm, nativeTTS, extraOutput])
      ).toThrow(ConfigurationError);
      expect(() =>
        resolveProviders([nativeSTT, llm, nativeTTS, extraOutput])
      ).toThrow(/Duplicate role/);
    });

    it('throws when two NativeSTT instances are provided', () => {
      const stt1 = new NativeSTT();
      const stt2 = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      expect(() =>
        resolveProviders([stt1, stt2, llm, nativeTTS])
      ).toThrow(ConfigurationError);
      expect(() =>
        resolveProviders([stt1, stt2, llm, nativeTTS])
      ).toThrow(/Duplicate role "input"/);
    });
  });

  describe('default auto-fill with multi-role providers', () => {
    it('auto-fills NativeSTT (input+stt) when only LLM + NativeTTS provided', () => {
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      const pipeline = resolveProviders([llm, nativeTTS]);

      // Auto-filled NativeSTT should cover both input and stt
      expect(pipeline.input).toBe(pipeline.stt);
      expect(pipeline.input.constructor.name).toBe('NativeSTT');
      expect(pipeline.tts).toBe(nativeTTS);
      expect(pipeline.output).toBe(nativeTTS);
    });

    it('auto-fills NativeTTS (tts+output) when only NativeSTT + LLM provided', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();

      const pipeline = resolveProviders([nativeSTT, llm]);

      // Auto-filled NativeTTS should cover both tts and output
      expect(pipeline.tts).toBe(pipeline.output);
      expect(pipeline.tts.constructor.name).toBe('NativeTTS');
      expect(pipeline.input).toBe(nativeSTT);
      expect(pipeline.stt).toBe(nativeSTT);
    });

    it('auto-fills both NativeSTT and NativeTTS when only LLM provided', () => {
      const llm = new MockLLMProvider();

      const pipeline = resolveProviders([llm]);

      expect(pipeline.input).toBe(pipeline.stt);
      expect(pipeline.input.constructor.name).toBe('NativeSTT');
      expect(pipeline.tts).toBe(pipeline.output);
      expect(pipeline.tts.constructor.name).toBe('NativeTTS');
      expect(pipeline.llm).toBe(llm);
    });
  });

  describe('provider order independence', () => {
    it('resolves correctly regardless of provider array order', () => {
      const nativeSTT = new NativeSTT();
      const llm = new MockLLMProvider();
      const nativeTTS = new NativeTTS();

      // Different orderings should all produce the same pipeline
      const p1 = resolveProviders([nativeSTT, llm, nativeTTS]);
      const p2 = resolveProviders([nativeTTS, nativeSTT, llm]);
      const p3 = resolveProviders([llm, nativeTTS, nativeSTT]);

      // All pipelines should have the same provider instances in the same slots
      for (const p of [p1, p2, p3]) {
        expect(p.input).toBe(nativeSTT);
        expect(p.stt).toBe(nativeSTT);
        expect(p.llm).toBe(llm);
        expect(p.tts).toBe(nativeTTS);
        expect(p.output).toBe(nativeTTS);
      }
    });
  });
});
