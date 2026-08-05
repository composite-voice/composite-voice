/**
 * Tests for FallbackSTT — the STT provider fallback chain.
 */

import { FallbackSTT } from '../../../../src/providers/stt/fallback/FallbackSTT';
import { ConfigurationError, TimeoutError } from '../../../../src/utils/errors';
import type {
  LiveSTTProvider,
  ProviderFallbackInfo,
  STTProviderConfig,
  TranscriptionResult,
} from '../../../../src/core/types/providers';
import type { ProviderRole } from '../../../../src/core/types/roles';

// ─── Controllable mock live STT provider ────────────────────────────────────

interface MockBehavior {
  /** Reject initialize() with this error. */
  initError?: Error;
  /** Reject connect() with this error. */
  connectError?: Error;
  /** Delay connect() resolution by this many ms (for timeout tests). */
  connectDelayMs?: number;
  /** Throw from sendAudio(). */
  sendAudioError?: Error;
}

class MockChainSTT implements LiveSTTProvider {
  readonly type = 'websocket' as const;
  roles: readonly ProviderRole[] = ['stt'];
  config: STTProviderConfig = { model: 'mock' };

  behavior: MockBehavior;
  callback?: (result: TranscriptionResult) => void;

  initializeCalls = 0;
  connectCalls = 0;
  disconnectCalls = 0;
  receivedAudio: ArrayBuffer[] = [];
  private ready = false;
  connected = false;

  constructor(behavior: MockBehavior = {}) {
    this.behavior = behavior;
  }

  async initialize(): Promise<void> {
    this.initializeCalls++;
    if (this.behavior.initError) throw this.behavior.initError;
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
    this.connectCalls++;
    if (this.behavior.connectDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.behavior.connectDelayMs));
    }
    if (this.behavior.connectError) throw this.behavior.connectError;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls++;
    this.connected = false;
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.behavior.sendAudioError) throw this.behavior.sendAudioError;
    this.receivedAudio.push(chunk);
  }

  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.callback = callback;
  }

  isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.utteranceComplete === true;
  }

  isPreflight(result: TranscriptionResult): boolean {
    return result.isPreflight === true;
  }

  isInterim(result: TranscriptionResult): boolean {
    return !result.isFinal;
  }

  isFinal(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  // Test helper: emit a result as if it came from the remote service.
  emit(result: TranscriptionResult): void {
    this.callback?.(result);
  }
}

function chunk(byte: number): ArrayBuffer {
  return new Uint8Array([byte]).buffer;
}

async function flushMicrotasks(): Promise<void> {
  // Failover runs async (disconnect + connect); a few turns settle it.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('FallbackSTT', () => {
  // ─── Construction ───────────────────────────────────────────────────

  describe('constructor validation', () => {
    it('throws on an empty providers array', () => {
      expect(() => new FallbackSTT([])).toThrow(ConfigurationError);
    });

    it('throws when a REST provider is included', () => {
      const rest = new MockChainSTT();
      (rest as unknown as { type: string }).type = 'rest';
      expect(() => new FallbackSTT([rest])).toThrow(/live \(WebSocket\)/);
    });

    it('throws when a multi-role provider is included', () => {
      const multiRole = new MockChainSTT();
      multiRole.roles = ['input', 'stt'];
      expect(() => new FallbackSTT([multiRole])).toThrow(/single-role/);
    });

    it('declares the stt role and websocket type', () => {
      const stt = new FallbackSTT([new MockChainSTT()]);
      expect(stt.type).toBe('websocket');
      expect(stt.roles).toEqual(['stt']);
    });
  });

  // ─── Initialization ─────────────────────────────────────────────────

  describe('initialize', () => {
    it('initializes all providers concurrently', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);

      await stt.initialize();

      expect(primary.initializeCalls).toBe(1);
      expect(backup.initializeCalls).toBe(1);
      expect(stt.isReady()).toBe(true);
      expect(stt.activeProvider).toBe(primary);
    });

    it('falls over to the backup when the primary fails to initialize', async () => {
      const primary = new MockChainSTT({ initError: new Error('bad key') });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      const swaps: ProviderFallbackInfo[] = [];
      stt.onFallback((info) => swaps.push(info));

      await stt.initialize();

      expect(stt.activeProvider).toBe(backup);
      expect(swaps).toHaveLength(1);
      expect(swaps[0]).toMatchObject({
        role: 'stt',
        from: 'MockChainSTT',
        to: 'MockChainSTT',
        reason: 'init-error',
      });
      expect(swaps[0]?.error.message).toBe('bad key');
    });

    it('throws when every provider fails to initialize', async () => {
      const primary = new MockChainSTT({ initError: new Error('primary down') });
      const backup = new MockChainSTT({ initError: new Error('backup down') });
      const stt = new FallbackSTT([primary, backup]);

      await expect(stt.initialize()).rejects.toThrow('primary down');
    });
  });

  // ─── Connection failover ────────────────────────────────────────────

  describe('connect', () => {
    it('connects the primary when healthy', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();

      await stt.connect();

      expect(primary.connected).toBe(true);
      expect(backup.connectCalls).toBe(0);
    });

    it('fails over to the backup on a connection error', async () => {
      const primary = new MockChainSTT({ connectError: new Error('refused') });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      const swaps: ProviderFallbackInfo[] = [];
      stt.onFallback((info) => swaps.push(info));
      await stt.initialize();

      await stt.connect();

      expect(backup.connected).toBe(true);
      expect(stt.activeProvider).toBe(backup);
      expect(swaps).toHaveLength(1);
      expect(swaps[0]?.reason).toBe('connect-error');
    });

    it('fails over on a connection timeout', async () => {
      const primary = new MockChainSTT({ connectDelayMs: 200 });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup], { connectTimeout: 20 });
      const swaps: ProviderFallbackInfo[] = [];
      stt.onFallback((info) => swaps.push(info));
      await stt.initialize();

      await stt.connect();

      expect(backup.connected).toBe(true);
      expect(swaps).toHaveLength(1);
      expect(swaps[0]?.reason).toBe('connect-timeout');
      expect(swaps[0]?.error).toBeInstanceOf(TimeoutError);
    });

    it('throws the last error when every provider fails to connect', async () => {
      const primary = new MockChainSTT({ connectError: new Error('primary refused') });
      const backup = new MockChainSTT({ connectError: new Error('backup refused') });
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();

      await expect(stt.connect()).rejects.toThrow('backup refused');
    });

    it('routes audio to the provider that won the failover', async () => {
      const primary = new MockChainSTT({ connectError: new Error('refused') });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();
      await stt.connect();

      stt.sendAudio(chunk(1));

      expect(backup.receivedAudio).toHaveLength(1);
      expect(primary.receivedAudio).toHaveLength(0);
    });
  });

  // ─── Mid-session failover ───────────────────────────────────────────

  describe('mid-session failover', () => {
    it('swaps to the backup when the active provider emits an error result', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      const swaps: ProviderFallbackInfo[] = [];
      const results: TranscriptionResult[] = [];
      stt.onFallback((info) => swaps.push(info));
      stt.onTranscription((result) => results.push(result));
      await stt.initialize();
      await stt.connect();

      primary.emit({ text: '', isFinal: false, metadata: { error: 'ws_closed' } });
      await flushMicrotasks();

      expect(stt.activeProvider).toBe(backup);
      expect(backup.connected).toBe(true);
      expect(primary.disconnectCalls).toBeGreaterThanOrEqual(1);
      expect(swaps).toHaveLength(1);
      expect(swaps[0]?.reason).toBe('stream-error');
      // The error result is consumed by the failover, not forwarded.
      expect(results).toHaveLength(0);
    });

    it('buffers audio during the swap and replays it to the backup', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT({ connectDelayMs: 20 });
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();
      await stt.connect();

      primary.emit({ text: '', isFinal: false, metadata: { error: 'ws_closed' } });
      // Failover is in flight (backup connect is delayed) — audio must buffer.
      stt.sendAudio(chunk(1));
      stt.sendAudio(chunk(2));
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(backup.receivedAudio).toHaveLength(2);
      expect(primary.receivedAudio).toHaveLength(0);
    });

    it('fails over when sendAudio throws on the active provider', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      const swaps: ProviderFallbackInfo[] = [];
      stt.onFallback((info) => swaps.push(info));
      await stt.initialize();
      await stt.connect();

      primary.behavior.sendAudioError = new Error('socket closed');
      stt.sendAudio(chunk(7));
      await flushMicrotasks();

      expect(swaps).toHaveLength(1);
      expect(swaps[0]?.reason).toBe('stream-error');
      // The chunk that hit the dead provider is replayed on the backup.
      expect(backup.receivedAudio).toHaveLength(1);
    });

    it('ignores stale results from a provider that was failed away from', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      const results: TranscriptionResult[] = [];
      stt.onTranscription((result) => results.push(result));
      await stt.initialize();
      await stt.connect();

      primary.emit({ text: '', isFinal: false, metadata: { error: 'ws_closed' } });
      await flushMicrotasks();

      primary.emit({ text: 'late result from dead provider', isFinal: true });
      backup.emit({ text: 'hello from backup', isFinal: true });

      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe('hello from backup');
    });

    it('forwards a terminal error result when the whole chain is exhausted', async () => {
      const primary = new MockChainSTT();
      const stt = new FallbackSTT([primary]);
      const results: TranscriptionResult[] = [];
      stt.onTranscription((result) => results.push(result));
      await stt.initialize();
      await stt.connect();

      primary.emit({ text: '', isFinal: false, metadata: { error: 'ws_closed' } });
      await flushMicrotasks();

      // With no backup remaining, the error result reaches the pipeline.
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata?.error).toBe('ws_closed');
    });
  });

  // ─── Transcription passthrough & guards ─────────────────────────────

  describe('transcription passthrough', () => {
    it('forwards results from the active provider', async () => {
      const primary = new MockChainSTT();
      const stt = new FallbackSTT([primary]);
      const results: TranscriptionResult[] = [];
      stt.onTranscription((result) => results.push(result));
      await stt.initialize();
      await stt.connect();

      primary.emit({ text: 'hello', isFinal: true, utteranceComplete: true });

      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe('hello');
    });

    it('delegates guard methods to the active provider', async () => {
      const primary = new MockChainSTT();
      const stt = new FallbackSTT([primary]);
      await stt.initialize();

      const complete: TranscriptionResult = { text: 'x', isFinal: true, utteranceComplete: true };
      const interim: TranscriptionResult = { text: 'x', isFinal: false };

      expect(stt.isUtteranceComplete(complete)).toBe(true);
      expect(stt.isFinal(complete)).toBe(true);
      expect(stt.isInterim(interim)).toBe(true);
      expect(stt.isPreflight(interim)).toBe(false);
    });

    it('exposes the active provider config', () => {
      const primary = new MockChainSTT();
      primary.config = { model: 'primary-model' };
      const stt = new FallbackSTT([primary, new MockChainSTT()]);
      expect(stt.config.model).toBe('primary-model');
    });
  });

  // ─── Session lifecycle ──────────────────────────────────────────────

  describe('lifecycle', () => {
    it('disconnect() disconnects the active provider', async () => {
      const primary = new MockChainSTT();
      const stt = new FallbackSTT([primary]);
      await stt.initialize();
      await stt.connect();

      await stt.disconnect();

      expect(primary.connected).toBe(false);
    });

    it('stays on the backup across reconnects (sticky failover)', async () => {
      const primary = new MockChainSTT({ connectError: new Error('refused') });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();
      await stt.connect();
      await stt.disconnect();

      await stt.connect();

      expect(stt.activeProvider).toBe(backup);
      expect(primary.connectCalls).toBe(1);
    });

    it('resetToPrimary() restores the primary between sessions', async () => {
      const primary = new MockChainSTT({ connectError: new Error('refused') });
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();
      await stt.connect();
      await stt.disconnect();

      delete primary.behavior.connectError;
      stt.resetToPrimary();
      await stt.connect();

      expect(stt.activeProvider).toBe(primary);
      expect(primary.connected).toBe(true);
    });

    it('resetToPrimary() throws while connected', async () => {
      const stt = new FallbackSTT([new MockChainSTT()]);
      await stt.initialize();
      await stt.connect();

      expect(() => stt.resetToPrimary()).toThrow();
    });

    it('dispose() disposes every provider in the chain', async () => {
      const primary = new MockChainSTT();
      const backup = new MockChainSTT();
      const stt = new FallbackSTT([primary, backup]);
      await stt.initialize();

      await stt.dispose();

      expect(primary.isReady()).toBe(false);
      expect(backup.isReady()).toBe(false);
      expect(stt.isReady()).toBe(false);
    });
  });
});
