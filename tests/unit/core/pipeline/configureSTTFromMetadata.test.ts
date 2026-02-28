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
  isReady() { return true; }
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
  isReady() { return true; }
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
  isReady() { return true; }
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
  isReady() { return true; }
}

/** Stub for ElevenLabsSTT — should be a no-op target. */
class ElevenLabsSTT {
  readonly type = 'websocket' as const;
  readonly roles: readonly ProviderRole[] = ['stt'];
  config: { model?: string };

  constructor(config: ElevenLabsSTT['config'] = {}) {
    this.config = config;
  }

  async initialize() {}
  async dispose() {}
  isReady() { return true; }
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

  // ─── No-op providers ────────────────────────────────────────────────────

  describe('no-op for unsupported providers', () => {
    it('does not modify NativeSTT', () => {
      const stt = new NativeSTT({ language: 'en-US' });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ language: 'en-US' });
    });

    it('does not modify ElevenLabsSTT', () => {
      const stt = new ElevenLabsSTT({ model: 'scribe_v2_realtime' });
      configureSTTFromMetadata(stt, defaultMetadata);

      expect(stt.config).toEqual({ model: 'scribe_v2_realtime' });
    });
  });
});
