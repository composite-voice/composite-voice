/**
 * Tests for the typed `startListening(target?)` attach forwarding.
 *
 * When the configured input provider implements the AttachableInputProvider
 * contract (an `attach()` method), CompositeVoice.startListening() accepts
 * the platform handle as an optional, typed parameter and forwards it to
 * `attach()` before capture starts. Pipelines without an attachable input
 * keep the zero-argument signature.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import { ConfigurationError } from '../../../src/utils/errors';
import {
  MockInputProvider,
  MockSTTProvider,
  MockLLMProvider,
  MockTTSProvider,
  MockOutputProvider,
} from '../../mocks/MockProviders';

/** The platform handle type used by the fake adapter provider. */
interface FakeSocket {
  id: string;
}

/** An input provider with an attach() hook, like TwilioMediaStream et al. */
class MockAttachableInput extends MockInputProvider {
  public attachedWith: FakeSocket[] = [];
  public attachCalledBeforeStart: boolean | null = null;

  attach(target: FakeSocket): void {
    this.attachedWith.push(target);
    this.attachCalledBeforeStart = !this.startCalled;
  }
}

/** An attachable input whose attach() is async, like ZoomRtmsInput. */
class MockAsyncAttachableInput extends MockInputProvider {
  public attached: FakeSocket | null = null;

  async attach(target: FakeSocket): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.attached = target;
  }
}

function restOfPipeline() {
  return [
    new MockSTTProvider(),
    new MockLLMProvider(),
    new MockTTSProvider(),
    new MockOutputProvider(),
  ] as const;
}

describe('startListening() attach forwarding', () => {
  it('forwards the target to attach() before starting capture', async () => {
    const input = new MockAttachableInput();
    const voice = new CompositeVoice({ providers: [input, ...restOfPipeline()] });
    await voice.initialize();

    const socket: FakeSocket = { id: 'call-1' };
    await voice.startListening(socket);

    expect(input.attachedWith).toEqual([{ id: 'call-1' }]);
    expect(input.attachCalledBeforeStart).toBe(true);
    expect(input.startCalled).toBe(true);
  });

  it('awaits an async attach() before starting capture', async () => {
    const input = new MockAsyncAttachableInput();
    const voice = new CompositeVoice({ providers: [input, ...restOfPipeline()] });
    await voice.initialize();

    await voice.startListening({ id: 'call-2' });

    expect(input.attached).toEqual({ id: 'call-2' });
    expect(input.startCalled).toBe(true);
  });

  it('does not call attach() when no target is passed', async () => {
    const input = new MockAttachableInput();
    const voice = new CompositeVoice({ providers: [input, ...restOfPipeline()] });
    await voice.initialize();

    await voice.startListening();

    expect(input.attachedWith).toEqual([]);
    expect(input.startCalled).toBe(true);
  });

  it('throws ConfigurationError when a target is passed but the input has no attach()', async () => {
    const input = new MockInputProvider();
    const voice = new CompositeVoice({ providers: [input, ...restOfPipeline()] });
    await voice.initialize();

    await expect(
      (voice as CompositeVoice<[MockAttachableInput]>).startListening({ id: 'nope' })
    ).rejects.toThrow(ConfigurationError);
    expect(input.startCalled).toBe(false);
  });

  it('surfaces attach() failures and does not start capture', async () => {
    class FailingAttachInput extends MockInputProvider {
      attach(): void {
        throw new Error('socket already closed');
      }
    }
    const input = new FailingAttachInput();
    const voice = new CompositeVoice({ providers: [input, ...restOfPipeline()] });
    await voice.initialize();

    await expect(voice.startListening({ id: 'x' } as never)).rejects.toThrow(
      'socket already closed'
    );
    expect(input.startCalled).toBe(false);
  });

  describe('compile-time signature (never executed)', () => {
    it('type-checks', () => {
      // These closures are intentionally never invoked — they only pin the
      // conditional startListening() signature at compile time.
      const signatures = {
        adapterPipelineAcceptsTypedTarget: async () => {
          const voice = new CompositeVoice({
            providers: [new MockAttachableInput(), ...restOfPipeline()],
          });
          await voice.startListening({ id: 'typed' });
          await voice.startListening(); // target stays optional
          // @ts-expect-error — target must be a FakeSocket, not a string
          await voice.startListening('not-a-socket');
        },
        plainPipelineTakesNoParam: async () => {
          const voice = new CompositeVoice({
            providers: [new MockInputProvider(), ...restOfPipeline()],
          });
          await voice.startListening();
          // @ts-expect-error — no attachable input provider in this pipeline
          await voice.startListening({ id: 'nope' });
        },
      };
      expect(typeof signatures.adapterPipelineAcceptsTypedTarget).toBe('function');
      expect(typeof signatures.plainPipelineTakesNoParam).toBe('function');
    });
  });
});
