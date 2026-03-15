/**
 * Tests for guard methods on base provider subclasses:
 * - BaseSTTProvider: isUtteranceComplete(), isPreflight(), isInterim(), isFinal()
 * - BaseLLMProvider: isToolCall(), processText()
 * - BaseTTSProvider: isAudioReady()
 */

import { BaseSTTProvider } from '../../../../src/providers/base/BaseSTTProvider';
import { BaseLLMProvider } from '../../../../src/providers/base/BaseLLMProvider';
import { BaseTTSProvider } from '../../../../src/providers/base/BaseTTSProvider';
import type {
  STTProviderConfig,
  LLMProviderConfig,
  TTSProviderConfig,
  TranscriptionResult,
  LLMGenerationOptions,
  LLMMessage,
} from '../../../../src/core/types/providers';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ---------------------------------------------------------------------------
// Concrete test subclasses
// ---------------------------------------------------------------------------

class TestSTTProvider extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  processAudio(_chunk: ArrayBuffer): void {}

  // Expose protected guards
  public callIsUtteranceComplete(result: TranscriptionResult): boolean {
    return this.isUtteranceComplete(result);
  }
  public callIsPreflight(result: TranscriptionResult): boolean {
    return this.isPreflight(result);
  }
  public callIsInterim(result: TranscriptionResult): boolean {
    return this.isInterim(result);
  }
  public callIsFinal(result: TranscriptionResult): boolean {
    return this.isFinal(result);
  }
}

class TestLLMProvider extends BaseLLMProvider {
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  async generate(
    _prompt: string,
    _options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    return (async function* () {
      yield 'hello';
    })();
  }

  async generateFromMessages(
    _messages: LLMMessage[],
    _options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    return (async function* () {
      yield 'hello';
    })();
  }

  async processMessages(
    _messages: LLMMessage[],
    _options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    return (async function* () {
      yield 'hello';
    })();
  }

  // Expose protected/public guards
  public callIsToolCall(): boolean {
    return this.isToolCall(undefined);
  }
  public async callProcessText(text: string): Promise<AsyncIterable<string>> {
    return this.processText(text);
  }
}

class TestTTSProvider extends BaseTTSProvider {
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  processChunk(_text: string): void {}
  async finalize(): Promise<void> {}

  // Expose protected guard
  public callIsAudioReady(chunk: AudioChunk): boolean {
    return this.isAudioReady(chunk);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STT guard methods (BaseSTTProvider)', () => {
  let stt: TestSTTProvider;

  beforeEach(() => {
    stt = new TestSTTProvider('websocket', {} as STTProviderConfig);
  });

  describe('isUtteranceComplete()', () => {
    it('should return true when result.utteranceComplete === true', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: true,
        utteranceComplete: true,
      };

      expect(stt.callIsUtteranceComplete(result)).toBe(true);
    });

    it('should return false when result.utteranceComplete is false', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: true,
        utteranceComplete: false,
      };

      expect(stt.callIsUtteranceComplete(result)).toBe(false);
    });

    it('should return false when result.utteranceComplete is undefined', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: true,
      };

      expect(stt.callIsUtteranceComplete(result)).toBe(false);
    });
  });

  describe('isPreflight()', () => {
    it('should return true when result.isPreflight === true', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: false,
        isPreflight: true,
      };

      expect(stt.callIsPreflight(result)).toBe(true);
    });

    it('should return false when result.isPreflight is false', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: false,
        isPreflight: false,
      };

      expect(stt.callIsPreflight(result)).toBe(false);
    });

    it('should return false when result.isPreflight is undefined', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: false,
      };

      expect(stt.callIsPreflight(result)).toBe(false);
    });
  });

  describe('isInterim()', () => {
    it('should return true when result.isFinal is false', () => {
      const result: TranscriptionResult = {
        text: 'hel',
        isFinal: false,
      };

      expect(stt.callIsInterim(result)).toBe(true);
    });

    it('should return true when result.isFinal is undefined (falsy)', () => {
      // TypeScript requires isFinal, but at runtime it might be missing
      const result = { text: 'hel' } as TranscriptionResult;

      expect(stt.callIsInterim(result)).toBe(true);
    });

    it('should return false when result.isFinal is true', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: true,
      };

      expect(stt.callIsInterim(result)).toBe(false);
    });
  });

  describe('isFinal()', () => {
    it('should return true when result.isFinal is true', () => {
      const result: TranscriptionResult = {
        text: 'hello',
        isFinal: true,
      };

      expect(stt.callIsFinal(result)).toBe(true);
    });

    it('should return false when result.isFinal is false', () => {
      const result: TranscriptionResult = {
        text: 'hel',
        isFinal: false,
      };

      expect(stt.callIsFinal(result)).toBe(false);
    });

    it('should return false when result.isFinal is undefined (falsy)', () => {
      const result = { text: 'hel' } as TranscriptionResult;

      expect(stt.callIsFinal(result)).toBe(false);
    });
  });
});

describe('LLM guard methods (BaseLLMProvider)', () => {
  let llm: TestLLMProvider;

  beforeEach(() => {
    llm = new TestLLMProvider({ model: 'test-model' } as LLMProviderConfig);
  });


  describe('isToolCall()', () => {
    it('should return false by default (base implementation)', () => {
      expect(llm.callIsToolCall()).toBe(false);
    });
  });

  describe('processText()', () => {
    it('should return an async iterable yielding the processed text', async () => {
      const iterable = await llm.callProcessText('Hello, world!');
      const chunks: string[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['hello']);
    });

    it('should handle empty string', async () => {
      const iterable = await llm.callProcessText('');
      const chunks: string[] = [];
      for await (const chunk of iterable) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['hello']);
    });
  });
});

describe('TTS guard methods (BaseTTSProvider)', () => {
  let tts: TestTTSProvider;

  beforeEach(() => {
    tts = new TestTTSProvider('websocket', {} as TTSProviderConfig);
  });

  describe('isAudioReady()', () => {
    it('should return true when chunk.data.byteLength > 0', () => {
      const chunk: AudioChunk = {
        data: new ArrayBuffer(1024),
        timestamp: Date.now(),
      };

      expect(tts.callIsAudioReady(chunk)).toBe(true);
    });

    it('should return false when chunk.data.byteLength === 0', () => {
      const chunk: AudioChunk = {
        data: new ArrayBuffer(0),
        timestamp: Date.now(),
      };

      expect(tts.callIsAudioReady(chunk)).toBe(false);
    });
  });
});
