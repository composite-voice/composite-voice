/**
 * Integration tests for the guardrail hook — the pluggable async filter
 * between LLM output and TTS.
 *
 * @remarks
 * These drive a real `CompositeVoice` through `sendMessage()` and assert on
 * what the TTS provider actually received, covering both TTS transports:
 *
 * - REST TTS gets the whole utterance, so guardrails run once at the `'final'`
 *   stage inside `processTTS()`.
 * - Live TTS gets streamed chunks, so guardrails run at the `'chunk'` stage
 *   through a `GuardrailStream` that segments the text first.
 */

import { CompositeVoice } from '../../src/CompositeVoice';
import {
  MockSTTProvider,
  MockLLMProvider,
  MockTTSProvider,
  MockOutputProvider,
} from '../mocks/MockProviders';
import {
  createPIIRedactionGuardrail,
  createPronunciationGuardrail,
  createBlocklistGuardrail,
} from '../../src/guardrails/index';
import type { Guardrail } from '../../src/core/types/guardrails';
import type { LiveTTSProvider, TTSProviderConfig } from '../../src/core/types/providers';
import type { ProviderRole } from '../../src/core/types/roles';
import type { AudioChunk, AudioMetadata } from '../../src/core/types/audio';

/** An LLM that streams a fixed sequence of chunks. */
class ScriptedLLM extends MockLLMProvider {
  constructor(private readonly chunks: readonly string[]) {
    super();
  }

  override async processText() {
    const chunks = this.chunks;
    return {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    };
  }
}

/** A REST TTS provider that records the text it was asked to synthesize. */
class RecordingRestTTS extends MockTTSProvider {
  public synthesized: string[] = [];

  override async synthesize(text: string): Promise<Blob> {
    this.synthesized.push(text);
    return super.synthesize(text);
  }
}

/** A Live TTS provider that records every text chunk it receives. */
class RecordingLiveTTS implements LiveTTSProvider {
  type = 'websocket' as const;
  roles: readonly ProviderRole[] = ['tts'];
  config: TTSProviderConfig = { model: 'mock-live' };

  public sent: string[] = [];
  public finalizeCount = 0;

  private ready = false;

  /** Whether `connect()` has run — asserted indirectly via `sendText` ordering. */
  public connected = false;

  async initialize(): Promise<void> {
    this.ready = true;
  }

  async dispose(): Promise<void> {
    this.ready = false;
    this.connected = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  sendText(chunk: string): void {
    this.sent.push(chunk);
  }

  async finalize(): Promise<void> {
    this.finalizeCount++;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onAudio(_callback: (chunk: AudioChunk) => void): void {}

  onMetadata(_callback: (metadata: AudioMetadata) => void): void {}

  isAudioReady(chunk: AudioChunk): boolean {
    return chunk.data.byteLength > 0;
  }

  /** What the provider would synthesize, as one string. */
  get spoken(): string {
    return this.sent.join('');
  }
}

/** Bring an agent up and hand it a message, returning once the turn is done. */
async function speak(voice: CompositeVoice, prompt = 'hello'): Promise<void> {
  await voice.initialize();
  await voice.startListening();
  await voice.sendMessage(prompt);
}

describe('guardrails with REST TTS (final stage)', () => {
  it('synthesizes the redacted text, not the raw model output', async () => {
    const tts = new RecordingRestTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Reach me at ', 'ada@example.com', ' any time.']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPIIRedactionGuardrail({ types: ['email'] })] },
    });

    await speak(voice);

    expect(tts.synthesized).toEqual(['Reach me at [redacted] any time.']);
    await voice.dispose();
  });

  it('leaves the llm.complete transcript unfiltered', async () => {
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Reach me at ada@example.com.']),
        new RecordingRestTTS(),
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPIIRedactionGuardrail({ types: ['email'] })] },
    });

    const completions: string[] = [];
    voice.on('llm.complete', (event) => void completions.push(event.text));

    await speak(voice);

    expect(completions).toEqual(['Reach me at ada@example.com.']);
    await voice.dispose();
  });

  it('reports the rewrite on guardrail.applied', async () => {
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Mail ada@example.com now.']),
        new RecordingRestTTS(),
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPIIRedactionGuardrail({ types: ['email'] })] },
    });

    const applied: Array<{ guardrail: string; stage: string; text: string }> = [];
    voice.on(
      'guardrail.applied',
      (event) =>
        void applied.push({ guardrail: event.guardrail, stage: event.stage, text: event.text })
    );

    await speak(voice);

    expect(applied).toEqual([
      { guardrail: 'pii-redaction', stage: 'final', text: 'Mail [redacted] now.' },
    ]);
    await voice.dispose();
  });

  it('skips synthesis entirely when a guardrail blocks', async () => {
    const tts = new RecordingRestTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Shipping Project Halcyon in June.']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createBlocklistGuardrail({ terms: ['Project Halcyon'] })] },
    });

    const events: string[] = [];
    voice.on('tts.start', () => void events.push('tts.start'));
    voice.on('guardrail.blocked', (event) => void events.push(`blocked:${event.guardrail}`));

    await speak(voice);

    expect(tts.synthesized).toEqual([]);
    expect(events).toEqual(['blocked:blocklist']);
    await voice.dispose();
  });

  it('speaks the raw text when no guardrails are configured', async () => {
    const tts = new RecordingRestTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Reach me at ada@example.com.']),
        tts,
        new MockOutputProvider(),
      ],
    });

    await speak(voice);

    expect(tts.synthesized).toEqual(['Reach me at ada@example.com.']);
    await voice.dispose();
  });

  it('speaks the raw text when guardrails are disabled', async () => {
    const tts = new RecordingRestTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Reach me at ada@example.com.']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: {
        enabled: false,
        filters: [createPIIRedactionGuardrail({ types: ['email'] })],
      },
    });

    await speak(voice);

    expect(tts.synthesized).toEqual(['Reach me at ada@example.com.']);
    await voice.dispose();
  });

  it('fails closed when configured to, suppressing the utterance', async () => {
    const tts = new RecordingRestTTS();
    const broken: Guardrail = {
      name: 'broken',
      check: () => {
        throw new Error('classifier unreachable');
      },
    };
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Anything at all.']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [broken], onError: 'block' },
    });

    const errors: Array<{ guardrail: string; policy: string }> = [];
    voice.on(
      'guardrail.error',
      (event) => void errors.push({ guardrail: event.guardrail, policy: event.policy })
    );

    await speak(voice);

    expect(tts.synthesized).toEqual([]);
    expect(errors).toEqual([{ guardrail: 'broken', policy: 'block' }]);
    await voice.dispose();
  });

  it('fails open by default, speaking the unfiltered text', async () => {
    const tts = new RecordingRestTTS();
    const broken: Guardrail = {
      name: 'broken',
      check: () => {
        throw new Error('classifier unreachable');
      },
    };
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Anything at all.']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [broken] },
    });

    await speak(voice);

    expect(tts.synthesized).toEqual(['Anything at all.']);
    await voice.dispose();
  });
});

describe('guardrails with Live TTS (chunk stage)', () => {
  it('rewrites streamed text before it reaches the provider', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Run the ', 'SQL ', 'query now. ']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: {
        filters: [createPronunciationGuardrail({ replacements: { SQL: 'sequel' } })],
      },
    });

    await speak(voice);

    expect(tts.spoken).toBe('Run the sequel query now. ');
    expect(tts.finalizeCount).toBe(1);
    await voice.dispose();
  });

  it('reports the filtered text on tts.start, not the raw response', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Run the ', 'SQL ', 'query now. ']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: {
        filters: [createPronunciationGuardrail({ replacements: { SQL: 'sequel' } })],
      },
    });

    const started: string[] = [];
    const completed: string[] = [];
    voice.on('tts.start', (event) => void started.push(event.text));
    voice.on('llm.complete', (event) => void completed.push(event.text));

    await speak(voice);

    // What is spoken is filtered; the transcript events stay raw.
    expect(started).toEqual(['Run the sequel query now. ']);
    expect(completed).toEqual(['Run the SQL query now. ']);
    await voice.dispose();
  });

  it('matches a pattern split across streamed chunks', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        // An address arriving in three pieces would defeat a per-chunk filter.
        new ScriptedLLM(['Mail ada', '@example', '.com today. ']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPIIRedactionGuardrail({ types: ['email'] })] },
    });

    await speak(voice);

    expect(tts.spoken).toBe('Mail [redacted] today. ');
    await voice.dispose();
  });

  it('reports the chunk stage on guardrail events', async () => {
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Mail ada@example.com today. ']),
        new RecordingLiveTTS(),
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPIIRedactionGuardrail({ types: ['email'] })] },
    });

    const stages: string[] = [];
    voice.on('guardrail.applied', (event) => void stages.push(event.stage));

    await speak(voice);

    expect(stages).toEqual(['chunk']);
    await voice.dispose();
  });

  it('stops feeding the provider once a guardrail blocks', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['This part is fine. ', 'Now Project Halcyon. ', 'And more after. ']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createBlocklistGuardrail({ terms: ['Project Halcyon'] })] },
    });

    await speak(voice);

    // Text already handed over cannot be recalled; everything after is dropped.
    expect(tts.spoken).toBe('This part is fine.');
    await voice.dispose();
  });

  it('streams the raw text when no guardrails are configured', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['Run the ', 'SQL ', 'query. ']),
        tts,
        new MockOutputProvider(),
      ],
    });

    await speak(voice);

    expect(tts.sent).toEqual(['Run the ', 'SQL ', 'query. ']);
    await voice.dispose();
  });

  it('flushes the trailing partial sentence', async () => {
    const tts = new RecordingLiveTTS();
    const voice = new CompositeVoice({
      providers: [
        new MockSTTProvider(),
        new ScriptedLLM(['One. ', 'Trailing text with no stop']),
        tts,
        new MockOutputProvider(),
      ],
      guardrails: { filters: [createPronunciationGuardrail({ replacements: { xyz: 'zyx' } })] },
    });

    await speak(voice);

    expect(tts.spoken).toBe('One. Trailing text with no stop');
    await voice.dispose();
  });

  describe('buffered mode', () => {
    it('holds all text until generation completes', async () => {
      const tts = new RecordingLiveTTS();
      const voice = new CompositeVoice({
        providers: [
          new MockSTTProvider(),
          new ScriptedLLM(['One. ', 'Two. ', 'Three. ']),
          tts,
          new MockOutputProvider(),
        ],
        guardrails: {
          mode: 'buffered',
          filters: [createPronunciationGuardrail({ replacements: { Two: '2' } })],
        },
      });

      await speak(voice);

      expect(tts.sent).toEqual(['One. 2. Three. ']);
      await voice.dispose();
    });

    it('suppresses the whole utterance when a guardrail blocks', async () => {
      const tts = new RecordingLiveTTS();
      const voice = new CompositeVoice({
        providers: [
          new MockSTTProvider(),
          new ScriptedLLM(['This part is fine. ', 'Now Project Halcyon. ']),
          tts,
          new MockOutputProvider(),
        ],
        guardrails: {
          mode: 'buffered',
          filters: [createBlocklistGuardrail({ terms: ['Project Halcyon'] })],
        },
      });

      await speak(voice);

      // Unlike streaming mode, nothing at all reaches the provider.
      expect(tts.sent).toEqual([]);
      await voice.dispose();
    });
  });
});
