/**
 * ProviderEventAdapter tests
 *
 * Verifies that the optional adapter correctly bridges provider callbacks
 * to the EventEmitter interface without requiring CompositeVoice.
 */

import { ProviderEventAdapter } from '../../../src/core/ProviderEventAdapter';
import { BaseSTTProvider } from '../../../src/providers/base/BaseSTTProvider';
import { BaseTTSProvider } from '../../../src/providers/base/BaseTTSProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../src/core/types/providers';
import type { TTSProviderConfig } from '../../../src/core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../../src/core/types/audio';

// The adapter emits custom event types ('stt.transcription') that are outside
// the SDK's standard EventListenerMap. We cast through `any` when subscribing
// to these adapter-specific events.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEmitter = any;

// ── Test doubles ────────────────────────────────────────────────────────────

class MockSTTProvider extends BaseSTTProvider {
  constructor() {
    const config: STTProviderConfig = { apiKey: 'test' };
    super('rest', config);
  }

  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  processAudio(_chunk: ArrayBuffer): void {
    // No-op for testing
  }

  /** Expose emitTranscription for testing. */
  simulateTranscription(result: TranscriptionResult): void {
    this.emitTranscription(result);
  }
}

class MockTTSProvider extends BaseTTSProvider {
  constructor() {
    const config: TTSProviderConfig = { apiKey: 'test' };
    super('rest', config);
  }

  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  processChunk(_text: string): void {
    // No-op for testing
  }

  async finalize(): Promise<void> {
    // No-op for testing
  }

  /** Expose emitAudio for testing. */
  simulateAudio(chunk: AudioChunk): void {
    this.emitAudio(chunk);
  }

  /** Expose emitMetadata for testing. */
  simulateMetadata(metadata: AudioMetadata): void {
    this.emitMetadata(metadata);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTranscriptionResult(overrides?: Partial<TranscriptionResult>): TranscriptionResult {
  return {
    text: 'hello world',
    isFinal: true,
    confidence: 0.95,
    ...overrides,
  };
}

function makeAudioChunk(): AudioChunk {
  return {
    data: new ArrayBuffer(16),
    timestamp: Date.now(),
  };
}

function makeAudioMetadata(): AudioMetadata {
  return {
    sampleRate: 24000,
    channels: 1,
    encoding: 'linear16',
    bitDepth: 16,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProviderEventAdapter', () => {
  let adapter: ProviderEventAdapter;

  beforeEach(() => {
    adapter = new ProviderEventAdapter();
  });

  describe('bridgeSTT', () => {
    it('should forward transcription results as events', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('stt.transcription', listener);

      const result = makeTranscriptionResult();
      stt.simulateTranscription(result);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stt.transcription',
          result,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should forward multiple transcription results', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('stt.transcription', listener);

      stt.simulateTranscription(makeTranscriptionResult({ text: 'first' }));
      stt.simulateTranscription(makeTranscriptionResult({ text: 'second' }));
      stt.simulateTranscription(makeTranscriptionResult({ text: 'third' }));

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should forward interim transcription results', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('stt.transcription', listener);

      const interimResult = makeTranscriptionResult({ isFinal: false, text: 'hel' });
      stt.simulateTranscription(interimResult);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          result: interimResult,
        })
      );
    });
  });

  describe('bridgeTTS', () => {
    it('should forward audio chunks as events', () => {
      const tts = new MockTTSProvider();
      adapter.bridgeTTS(tts);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('tts.audio', listener);

      const chunk = makeAudioChunk();
      tts.simulateAudio(chunk);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tts.audio',
          chunk,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should forward metadata as events', () => {
      const tts = new MockTTSProvider();
      adapter.bridgeTTS(tts);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('tts.metadata', listener);

      const metadata = makeAudioMetadata();
      tts.simulateMetadata(metadata);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tts.metadata',
          metadata,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should forward multiple audio chunks', () => {
      const tts = new MockTTSProvider();
      adapter.bridgeTTS(tts);

      const listener = jest.fn();
      (adapter as AnyEmitter).on('tts.audio', listener);

      tts.simulateAudio(makeAudioChunk());
      tts.simulateAudio(makeAudioChunk());
      tts.simulateAudio(makeAudioChunk());

      expect(listener).toHaveBeenCalledTimes(3);
    });
  });

  describe('multiple listeners', () => {
    it('should deliver STT events to all listeners', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      (adapter as AnyEmitter).on('stt.transcription', listener1);
      (adapter as AnyEmitter).on('stt.transcription', listener2);
      (adapter as AnyEmitter).on('stt.transcription', listener3);

      stt.simulateTranscription(makeTranscriptionResult());

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should deliver TTS audio events to all listeners', () => {
      const tts = new MockTTSProvider();
      adapter.bridgeTTS(tts);

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      (adapter as AnyEmitter).on('tts.audio', listener1);
      (adapter as AnyEmitter).on('tts.audio', listener2);

      tts.simulateAudio(makeAudioChunk());

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should deliver events to wildcard listeners', () => {
      const stt = new MockSTTProvider();
      const tts = new MockTTSProvider();
      adapter.bridgeSTT(stt);
      adapter.bridgeTTS(tts);

      const wildcardListener = jest.fn();
      adapter.on('*', wildcardListener);

      stt.simulateTranscription(makeTranscriptionResult());
      tts.simulateAudio(makeAudioChunk());
      tts.simulateMetadata(makeAudioMetadata());

      expect(wildcardListener).toHaveBeenCalledTimes(3);
    });
  });

  describe('works without CompositeVoice', () => {
    it('should bridge STT independently', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const results: unknown[] = [];
      (adapter as AnyEmitter).on('stt.transcription', (event: unknown) => {
        results.push(event);
      });

      stt.simulateTranscription(makeTranscriptionResult({ text: 'test without CompositeVoice' }));

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          type: 'stt.transcription',
          result: expect.objectContaining({ text: 'test without CompositeVoice' }),
        })
      );
    });

    it('should bridge TTS independently', () => {
      const tts = new MockTTSProvider();
      adapter.bridgeTTS(tts);

      const audioEvents: unknown[] = [];
      const metadataEvents: unknown[] = [];

      (adapter as AnyEmitter).on('tts.audio', (event: unknown) => {
        audioEvents.push(event);
      });
      (adapter as AnyEmitter).on('tts.metadata', (event: unknown) => {
        metadataEvents.push(event);
      });

      tts.simulateMetadata(makeAudioMetadata());
      tts.simulateAudio(makeAudioChunk());
      tts.simulateAudio(makeAudioChunk());

      expect(metadataEvents).toHaveLength(1);
      expect(audioEvents).toHaveLength(2);
    });

    it('should bridge both STT and TTS on the same adapter', () => {
      const stt = new MockSTTProvider();
      const tts = new MockTTSProvider();

      adapter.bridgeSTT(stt);
      adapter.bridgeTTS(tts);

      const allEvents: unknown[] = [];
      adapter.on('*', (event: unknown) => {
        allEvents.push(event);
      });

      stt.simulateTranscription(makeTranscriptionResult());
      tts.simulateAudio(makeAudioChunk());

      expect(allEvents).toHaveLength(2);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      const stt = new MockSTTProvider();
      adapter.bridgeSTT(stt);

      const listener = jest.fn();
      const unsubscribe = (adapter as AnyEmitter).on('stt.transcription', listener);

      stt.simulateTranscription(makeTranscriptionResult());
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      stt.simulateTranscription(makeTranscriptionResult());
      expect(listener).toHaveBeenCalledTimes(1); // still 1, not 2
    });
  });
});
