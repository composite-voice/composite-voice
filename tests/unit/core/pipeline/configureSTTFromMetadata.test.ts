/**
 * Tests for configureSTTFromMetadata — auto-fills STT config from input metadata.
 */

import { configureSTTFromMetadata } from '../../../../src/core/pipeline/configureSTTFromMetadata';
import type { AudioMetadata } from '../../../../src/core/types/audio';
import type { ProviderRole } from '../../../../src/core/types/roles';

// ─── Stub classes ───────────────────────────────────────────────────────────
//
// The function identifies providers by constructor.name, so test stubs must
// have matching class names. These minimal classes satisfy the BaseProvider
// interface while exposing mutable configs for assertion.

/** Standard input metadata used across most tests. */
const defaultMetadata: AudioMetadata = {
  sampleRate: 16000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
};

/** Stub matching DeepgramSTT's constructor name and config shape. */
class DeepgramSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { options?: { encoding?: string; sampleRate?: number; channels?: number } };

  constructor(config: DeepgramSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching DeepgramFlux's constructor name and config shape. */
class DeepgramFlux {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { options?: { encoding?: string; sampleRate?: number; channels?: number } };

  constructor(config: DeepgramFlux['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching AssemblyAISTT's constructor name and config shape. */
class AssemblyAISTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { sampleRate?: number };

  constructor(config: AssemblyAISTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub for NativeSTT — should be a no-op target. */
class NativeSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['input', 'stt'];
  config: { language?: string };

  constructor(config: NativeSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching ElevenLabsSTT's constructor name and config shape. */
class ElevenLabsSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { model?: string; audioFormat?: string };

  constructor(config: ElevenLabsSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching AzureSTT's constructor name and config shape. */
class AzureSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { sampleRate?: number; numChannels?: number; bitsPerSample?: number };

  constructor(config: AzureSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching GladiaSTT's constructor name and config shape. */
class GladiaSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { encoding?: string; sampleRate?: number; channels?: number; bitDepth?: number };

  constructor(config: GladiaSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching SpeechmaticsSTT's constructor name and config shape. */
class SpeechmaticsSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { audioFormat?: string; sampleRate?: number };

  constructor(config: SpeechmaticsSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching SonioxSTT's constructor name and config shape. */
class SonioxSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { audioFormat?: string; sampleRate?: number; numChannels?: number };

  constructor(config: SonioxSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching OpenAIRealtimeSTT's constructor name and config shape. */
class OpenAIRealtimeSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { inputAudioFormat?: string };

  constructor(config: OpenAIRealtimeSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching TranscribeSTT's constructor name and config shape. */
class TranscribeSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { mediaEncoding?: string; sampleRate?: number };

  constructor(config: TranscribeSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Stub matching RevAISTT's constructor name and config shape. */
class RevAISTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { sampleRate?: number; audioFormat?: string; numChannels?: number };

  constructor(config: RevAISTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

/** Structural fallback-chain stub — detected via `providers`, not class name. */
class FallbackSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config = {};
  readonly providers: object[];

  constructor(providers: object[]) {
    this.providers = providers;
  }

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }
}

// ─── DeepgramSTT auto-fill ──────────────────────────────────────────────────

describe('configureSTTFromMetadata', () => {
  describe('DeepgramSTT', () => {
    it('fills encoding, sampleRate, and channels when options is undefined', () => {
      const stt = new DeepgramSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options).toEqual({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      });
    });

    it('fills encoding, sampleRate, and channels when options is empty object', () => {
      const stt = new DeepgramSTT({ options: {} });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options).toEqual({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      });
    });

    it('does not overwrite user-set encoding', () => {
      const stt = new DeepgramSTT({ options: { encoding: 'opus' } });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options!.encoding).toBe('opus');
      expect(stt.config.options!.sampleRate).toBe(16000);
      expect(stt.config.options!.channels).toBe(1);
    });

    it('does not overwrite user-set sampleRate', () => {
      const stt = new DeepgramSTT({ options: { sampleRate: 48000 } });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options!.sampleRate).toBe(48000);
      expect(stt.config.options!.encoding).toBe('linear16');
      expect(stt.config.options!.channels).toBe(1);
    });

    it('does not overwrite user-set channels', () => {
      const stt = new DeepgramSTT({ options: { channels: 2 } });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options!.channels).toBe(2);
      expect(stt.config.options!.encoding).toBe('linear16');
      expect(stt.config.options!.sampleRate).toBe(16000);
    });

    it('does not overwrite any user-set values when all three are set', () => {
      const stt = new DeepgramSTT({
        options: { encoding: 'mulaw', sampleRate: 8000, channels: 2 },
      });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options).toEqual({
        encoding: 'mulaw',
        sampleRate: 8000,
        channels: 2,
      });
    });

    it('maps mulaw encoding correctly', () => {
      const stt = new DeepgramSTT();
      const metadata: AudioMetadata = {
        sampleRate: 8000,
        encoding: 'mulaw',
        channels: 1,
      };
      configureSTTFromMetadata(stt, metadata);

      expect(stt.config.options!.encoding).toBe('mulaw');
    });

    it('maps opus encoding correctly', () => {
      const stt = new DeepgramSTT();
      const metadata: AudioMetadata = {
        sampleRate: 48000,
        encoding: 'opus',
        channels: 2,
      };
      configureSTTFromMetadata(stt, metadata);

      expect(stt.config.options!.encoding).toBe('opus');
      expect(stt.config.options!.sampleRate).toBe(48000);
      expect(stt.config.options!.channels).toBe(2);
    });

    it('skips encoding mapping for unknown AudioEncoding values', () => {
      const stt = new DeepgramSTT();
      const metadata: AudioMetadata = {
        sampleRate: 16000,
        encoding: 'unknown-codec' as AudioMetadata['encoding'],
        channels: 1,
      };
      configureSTTFromMetadata(stt, metadata);

      // Encoding not set because there's no mapping
      expect(stt.config.options!.encoding).toBeUndefined();
      // sampleRate and channels still set
      expect(stt.config.options!.sampleRate).toBe(16000);
      expect(stt.config.options!.channels).toBe(1);
    });
  });

  // ─── DeepgramFlux ──────────────────────────────────────────────────────

  describe('DeepgramFlux', () => {
    it('fills options the same as DeepgramSTT', () => {
      const stt = new DeepgramFlux();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.options).toEqual({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      });
    });
  });

  // ─── AssemblyAISTT auto-fill ────────────────────────────────────────────

  describe('AssemblyAISTT', () => {
    it('fills sampleRate when not set', () => {
      const stt = new AssemblyAISTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.sampleRate).toBe(16000);
    });

    it('does not overwrite user-set sampleRate', () => {
      const stt = new AssemblyAISTT({ sampleRate: 48000 });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.sampleRate).toBe(48000);
    });

    it('uses metadata sampleRate from different input formats', () => {
      const stt = new AssemblyAISTT();
      const metadata: AudioMetadata = {
        sampleRate: 44100,
        encoding: 'linear16',
        channels: 2,
      };
      configureSTTFromMetadata(stt, metadata);

      expect(stt.config.sampleRate).toBe(44100);
    });
  });

  // ─── Remaining live STT providers ─────────────────────────────────────

  describe('AzureSTT', () => {
    it('fills sampleRate, numChannels, and bitsPerSample when unset', () => {
      const stt = new AzureSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ sampleRate: 16000, numChannels: 1, bitsPerSample: 16 });
    });

    it('does not overwrite user-set sampleRate', () => {
      const stt = new AzureSTT({ sampleRate: 48000 });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.sampleRate).toBe(48000);
      expect(stt.config.numChannels).toBe(1);
    });
  });

  describe('ElevenLabsSTT', () => {
    it('fills pcm_<rate> for linear16 at a documented sample rate', () => {
      const stt = new ElevenLabsSTT({ model: 'scribe_v2_realtime' });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.audioFormat).toBe('pcm_16000');
    });

    it('fills mulaw_8000 for mulaw telephony audio', () => {
      const stt = new ElevenLabsSTT();
      configureSTTFromMetadata(stt, { sampleRate: 8000, encoding: 'mulaw', channels: 1 });

      expect(stt.config.audioFormat).toBe('mulaw_8000');
    });

    it('does not overwrite user-set audioFormat', () => {
      const stt = new ElevenLabsSTT({ audioFormat: 'pcm_24000' });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.audioFormat).toBe('pcm_24000');
    });
  });

  describe('GladiaSTT', () => {
    it('fills encoding, sampleRate, channels, and bitDepth', () => {
      const stt = new GladiaSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({
        encoding: 'wav/pcm',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
      });
    });
  });

  describe('SpeechmaticsSTT', () => {
    it('fills pcm_s16le and sampleRate for linear16', () => {
      const stt = new SpeechmaticsSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ audioFormat: 'pcm_s16le', sampleRate: 16000 });
    });
  });

  describe('SonioxSTT', () => {
    it('fills audioFormat, sampleRate, and numChannels', () => {
      const stt = new SonioxSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({
        audioFormat: 'pcm_s16le',
        sampleRate: 16000,
        numChannels: 1,
      });
    });
  });

  describe('OpenAIRealtimeSTT', () => {
    it('fills inputAudioFormat for linear16', () => {
      const stt = new OpenAIRealtimeSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config.inputAudioFormat).toBe('audio/pcm');
    });

    it('maps mulaw to audio/pcmu', () => {
      const stt = new OpenAIRealtimeSTT();
      configureSTTFromMetadata(stt, { sampleRate: 8000, encoding: 'mulaw', channels: 1 });

      expect(stt.config.inputAudioFormat).toBe('audio/pcmu');
    });
  });

  describe('TranscribeSTT', () => {
    it('fills mediaEncoding and sampleRate', () => {
      const stt = new TranscribeSTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ mediaEncoding: 'pcm', sampleRate: 16000 });
    });
  });

  describe('RevAISTT', () => {
    it('fills sampleRate, audioFormat, and numChannels', () => {
      const stt = new RevAISTT();
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ sampleRate: 16000, audioFormat: 'S16LE', numChannels: 1 });
    });
  });

  describe('fallback chains', () => {
    it('configures every chain member', () => {
      const deepgram = new DeepgramSTT();
      const azure = new AzureSTT();
      const chain = new FallbackSTT([deepgram, azure]);

      configureSTTFromMetadata(chain, defaultMetadata);

      expect(deepgram.config.options).toEqual({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
      });
      expect(azure.config).toEqual({ sampleRate: 16000, numChannels: 1, bitsPerSample: 16 });
    });
  });

  // ─── No-op providers ────────────────────────────────────────────────────

  describe('no-op for unsupported providers', () => {
    it('does not modify NativeSTT', () => {
      const stt = new NativeSTT({ language: 'en-US' });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ language: 'en-US' });
    });
  });

  describe('self-configuring providers', () => {
    it('passes metadata to configureInputFormat when present', () => {
      const received: AudioMetadata[] = [];
      const stt = {
        type: 'websocket' as const,
        roles: ['stt', 'llm', 'tts'] as const,
        config: {},
        configureInputFormat: (metadata: AudioMetadata) => {
          received.push(metadata);
        },
        async initialize() {},
        async dispose() {},
        isReady() {
          return true;
        },
      };

      configureSTTFromMetadata(stt, defaultMetadata);

      expect(received).toEqual([defaultMetadata]);
    });
  });
});
