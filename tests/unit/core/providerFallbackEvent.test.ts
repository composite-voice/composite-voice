/**
 * Tests for the 'provider.fallback' SDK event bridge.
 *
 * FallbackSTT notifies swap listeners via onFallback(); CompositeVoice must
 * re-emit each notification as a typed 'provider.fallback' event so the
 * application knows the pipeline is running on a backup provider.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import { FallbackSTT } from '../../../src/providers/stt/fallback/FallbackSTT';
import type { ProviderFallbackEvent } from '../../../src/core/events/types';
import {
  MockLiveSTTProvider,
  MockLLMProvider,
  MockTTSProvider,
  MockInputProvider,
  MockOutputProvider,
} from '../../mocks/MockProviders';

/** A live STT provider whose initialization always fails. */
class FailingInitSTT extends MockLiveSTTProvider {
  override async initialize(): Promise<void> {
    throw new Error('primary credentials rejected');
  }
}

describe('provider.fallback event bridge', () => {
  it('emits provider.fallback when the chain swaps during initialization', async () => {
    const primary = new FailingInitSTT();
    const backup = new MockLiveSTTProvider();
    const fallback = new FallbackSTT([primary, backup]);

    const agent = new CompositeVoice({
      providers: [
        new MockInputProvider(),
        fallback,
        new MockLLMProvider(),
        new MockTTSProvider(),
        new MockOutputProvider(),
      ],
    });

    const events: ProviderFallbackEvent[] = [];
    agent.on('provider.fallback', (event) => {
      events.push(event);
    });

    await agent.initialize();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'provider.fallback',
      role: 'stt',
      from: 'FailingInitSTT',
      to: 'MockLiveSTTProvider',
      reason: 'init-error',
    });
    expect(events[0]?.error.message).toBe('primary credentials rejected');
    expect(events[0]?.timestamp).toBeGreaterThan(0);

    // The agent came up healthy on the backup provider.
    expect(agent.getState()).toBe('ready');
    expect(fallback.activeProvider).toBe(backup);

    await agent.dispose();
  });

  it('does not emit provider.fallback when the primary is healthy', async () => {
    const fallback = new FallbackSTT([new MockLiveSTTProvider(), new MockLiveSTTProvider()]);

    const agent = new CompositeVoice({
      providers: [
        new MockInputProvider(),
        fallback,
        new MockLLMProvider(),
        new MockTTSProvider(),
        new MockOutputProvider(),
      ],
    });

    const events: ProviderFallbackEvent[] = [];
    agent.on('provider.fallback', (event) => {
      events.push(event);
    });

    await agent.initialize();

    expect(events).toHaveLength(0);

    await agent.dispose();
  });
});
