/**
 * Deepgram Flux (STT V2) real-time speech-to-text provider using the official
 * Deepgram JS SDK V5 `listen.v2` API.
 *
 * @remarks
 * Unlike the V1 (`listen.live`) API used by {@link DeepgramSTT}, the V2 pipeline
 * delivers structured `TurnInfo` events (`StartOfTurn`, `Update`,
 * `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`) that map naturally to the
 * CompositeVoice eager-LLM pipeline.
 *
 * @packageDocumentation
 */

/* DISABLED — requires Deepgram SDK V5 (listen.v2 API)
 *
 * The V4 SDK does not expose a listen.v2 endpoint. This provider is preserved
 * for future re-enablement when the V5 SDK stabilizes.
 *
 * To re-enable:
 * 1. Upgrade @deepgram/sdk to >=5.x
 * 2. Uncomment the class body below
 * 3. Uncomment exports in ./index.ts and src/index.ts
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';

/**
 * Deepgram Flux transcription options passed to the V2 WebSocket connection.
 *
 * @see {@link DeepgramFluxConfig} for the full provider configuration
 */
export interface DeepgramFluxOptions {
  model?: string;
  encoding?: string;
  sampleRate?: number;
  eotThreshold?: number;
  eagerEotThreshold?: number;
  eotTimeoutMs?: number;
  keyterms?: string[];
  tag?: string;
  mipOptOut?: boolean;
}

/**
 * Configuration options for the {@link DeepgramFlux} provider.
 */
export interface DeepgramFluxConfig extends STTProviderConfig {
  apiKey?: string;
  proxyUrl?: string;
  options?: DeepgramFluxOptions;
}

/**
 * Deepgram Flux (V2) real-time STT provider — DISABLED.
 *
 * @remarks
 * This class is a placeholder. The V2 `listen.v2` API requires
 * `@deepgram/sdk` V5 which is currently unstable. The class extends
 * {@link LiveSTTProvider} to preserve type compatibility but all methods
 * throw at runtime.
 */
export class DeepgramFlux extends LiveSTTProvider {
  declare public config: DeepgramFluxConfig;

  constructor(config: DeepgramFluxConfig) {
    super({ language: config.language ?? 'en-US', interimResults: true, ...config });
    throw new Error(
      'DeepgramFlux is disabled — requires @deepgram/sdk V5 (listen.v2 API). ' +
        'Use DeepgramSTT with Nova models instead.'
    );
  }

  protected async onInitialize(): Promise<void> {
    throw new Error('DeepgramFlux is disabled');
  }

  protected async onDispose(): Promise<void> {
    /* no-op */
  }

  async connect(): Promise<void> {
    throw new Error('DeepgramFlux is disabled');
  }

  protected sendAudioToSocket(): void {
    throw new Error('DeepgramFlux is disabled');
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  isWebSocketConnected(): boolean {
    return false;
  }
}
