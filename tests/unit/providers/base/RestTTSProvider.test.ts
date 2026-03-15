/**
 * Tests for RestTTSProvider processChunk/finalize text accumulation.
 */

import { RestTTSProvider } from '../../../../src/providers/base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../../src/core/types/providers';

// Concrete subclass with a spy-able synthesize()
class TestRestTTSProvider extends RestTTSProvider {
  public synthesizeCalls: string[] = [];

  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  async synthesize(text: string): Promise<Blob> {
    this.synthesizeCalls.push(text);
    return new Blob([text], { type: 'audio/pcm' });
  }
}

describe('RestTTSProvider processChunk / finalize', () => {
  let provider: TestRestTTSProvider;

  beforeEach(() => {
    provider = new TestRestTTSProvider({} as TTSProviderConfig);
  });

  it('should accumulate text via processChunk', () => {
    provider.processChunk('Hello');
    provider.processChunk(' world');

    // No synthesize calls yet -- text is only buffered
    expect(provider.synthesizeCalls).toHaveLength(0);
  });

  it('should call synthesize with accumulated text on finalize', async () => {
    provider.processChunk('Hello');
    provider.processChunk(' world');

    await provider.finalize();

    expect(provider.synthesizeCalls).toEqual(['Hello world']);
  });

  it('should clear buffer after finalize', async () => {
    provider.processChunk('First utterance');
    await provider.finalize();

    // Second finalize should NOT call synthesize (buffer is empty, text.length === 0)
    await provider.finalize();

    expect(provider.synthesizeCalls).toEqual(['First utterance']);
  });

  it('should concatenate multiple processChunk calls', async () => {
    provider.processChunk('a');
    provider.processChunk('b');
    provider.processChunk('c');

    await provider.finalize();

    expect(provider.synthesizeCalls).toEqual(['abc']);
  });

  it('should handle empty processChunk calls', async () => {
    provider.processChunk('');
    provider.processChunk('Hello');
    provider.processChunk('');

    await provider.finalize();

    expect(provider.synthesizeCalls).toEqual(['Hello']);
  });

  it('should not call synthesize when finalize without any processChunk', async () => {
    await provider.finalize();

    expect(provider.synthesizeCalls).toEqual([]);
  });
});
