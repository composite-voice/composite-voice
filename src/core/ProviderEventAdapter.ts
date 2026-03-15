/**
 * Optional adapter that bridges provider callbacks to the typed EventEmitter.
 *
 * @packageDocumentation
 */

import { EventEmitter } from './events/EventEmitter';
import type { BaseSTTProvider } from '../providers/base/BaseSTTProvider';
import type { BaseTTSProvider } from '../providers/base/BaseTTSProvider';

/**
 * Optional adapter that bridges provider callbacks to a typed {@link EventEmitter}.
 *
 * @remarks
 * This is **not** used by the default pipeline. {@link CompositeVoice} wires
 * providers directly via callbacks for minimal overhead. Use this adapter when
 * you need provider-level event subscriptions outside of CompositeVoice, such
 * as for testing, debugging, or building custom pipelines.
 *
 * The adapter registers itself as the callback consumer on each provider via
 * {@link ProviderEventAdapter.bridgeSTT | bridgeSTT()} and
 * {@link ProviderEventAdapter.bridgeTTS | bridgeTTS()}, then re-emits each
 * callback invocation as a typed event through the inherited {@link EventEmitter}
 * interface.
 *
 * **Important:** Calling `bridgeSTT()` or `bridgeTTS()` will replace any
 * previously registered callback on the provider. Do not use this adapter on
 * providers that are already wired into a CompositeVoice instance.
 *
 * @example Basic usage
 * ```typescript
 * import { ProviderEventAdapter } from 'composite-voice';
 * import { DeepgramSTT, DeepgramTTS } from 'composite-voice';
 *
 * const adapter = new ProviderEventAdapter();
 * const stt = new DeepgramSTT({ apiKey: '...' });
 * const tts = new DeepgramTTS({ apiKey: '...' });
 *
 * adapter.bridgeSTT(stt);
 * adapter.bridgeTTS(tts);
 *
 * // Subscribe to provider-level events
 * adapter.on('tts.audio', (event) => {
 *   console.log('Raw TTS chunk:', event.chunk.data.byteLength, 'bytes');
 * });
 *
 * adapter.on('transcription.interim', (event) => {
 *   console.log('Interim:', event.text);
 * });
 * ```
 *
 * @example Testing a custom STT provider
 * ```typescript
 * const adapter = new ProviderEventAdapter();
 * adapter.bridgeSTT(myCustomSTT);
 *
 * const results: TranscriptionResult[] = [];
 * adapter.on('stt.transcription', (event) => {
 *   results.push(event.result);
 * });
 *
 * await myCustomSTT.initialize();
 * // ... trigger transcription ...
 * expect(results).toHaveLength(1);
 * ```
 *
 * @see {@link EventEmitter} for subscription methods (`on`, `once`, `off`)
 * @see ARCHITECTURE.md for why this adapter exists and when to use it
 */
export class ProviderEventAdapter extends EventEmitter {
  /**
   * Bridge an STT provider's transcription callback to this event emitter.
   *
   * @remarks
   * Registers an `onTranscription` callback on the provider that re-emits
   * each {@link TranscriptionResult} as an `'stt.transcription'` event.
   *
   * **Warning:** This replaces any previously registered transcription callback
   * on the provider.
   *
   * @param stt - The STT provider to bridge.
   */
  bridgeSTT(stt: BaseSTTProvider): void {
    stt.onTranscription((result) => {
      this.emitSync({
        type: 'stt.transcription' as never,
        result,
        timestamp: Date.now(),
      } as never);
    });
  }

  /**
   * Bridge a TTS provider's audio and metadata callbacks to this event emitter.
   *
   * @remarks
   * Registers `onAudio` and `onMetadata` callbacks on the provider that
   * re-emit as `'tts.audio'` and `'tts.metadata'` events respectively.
   *
   * **Warning:** This replaces any previously registered audio and metadata
   * callbacks on the provider.
   *
   * @param tts - The TTS provider to bridge.
   */
  bridgeTTS(tts: BaseTTSProvider): void {
    tts.onAudio((chunk) => {
      this.emitSync({
        type: 'tts.audio',
        chunk,
        timestamp: Date.now(),
      } as never);
    });

    tts.onMetadata((metadata) => {
      this.emitSync({
        type: 'tts.metadata',
        metadata,
        timestamp: Date.now(),
      } as never);
    });
  }
}
