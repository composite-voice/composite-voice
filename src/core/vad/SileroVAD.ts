/**
 * Silero VAD engine running on ONNX Runtime.
 *
 * @remarks
 * `SileroVAD` implements {@link VADEngine} using the Silero voice activity
 * detection model — a small (~2 MB) recurrent network that scores 32 ms
 * frames of 16 kHz audio with a speech probability. Inference runs locally
 * via ONNX Runtime: `onnxruntime-web` in browsers (WASM) and
 * `onnxruntime-node` on servers. Both are **optional peer dependencies** —
 * install the one matching your runtime.
 *
 * Both current Silero model generations are supported and auto-detected
 * from the model's input signature at load time:
 *
 * - **v5** (`silero_vad_v5.onnx` / current `silero_vad.onnx`): inputs
 *   `input` [1, 576] (64 context samples + 512 frame samples), `state`
 *   [2, 1, 128], `sr`.
 * - **v4 / legacy** (`silero_vad_legacy.onnx`): inputs `input` [1, 512],
 *   `h` / `c` [2, 1, 64], `sr`.
 *
 * The model file is fetched from {@link SileroVADOptions.modelUrl} — a URL
 * in browsers, a URL or filesystem path in Node. The default points at a
 * pinned public CDN copy; production deployments should self-host the
 * model (and, for `onnxruntime-web`, its WASM assets) and pass their own
 * URL.
 *
 * @packageDocumentation
 */

import type { VADEngine } from './types';
import { importPeerDep } from '../../utils/importPeerDep';

/**
 * Pinned CDN copy of the Silero v5 model, used when no
 * {@link SileroVADOptions.modelUrl} is configured.
 *
 * @remarks
 * Convenient for prototyping; self-host the model for production.
 */
export const DEFAULT_SILERO_MODEL_URL =
  'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.22/dist/silero_vad_v5.onnx';

/** Silero operates on 16 kHz audio. */
const SILERO_SAMPLE_RATE = 16000;

/** Frame size at 16 kHz (≈32 ms). */
const SILERO_FRAME_SAMPLES = 512;

/** v5 models take 64 samples of leading context per frame. */
const V5_CONTEXT_SAMPLES = 64;

/**
 * The subset of the ONNX Runtime API SileroVAD uses.
 *
 * @remarks
 * Structural interface so the engine works with either `onnxruntime-web`
 * or `onnxruntime-node`, and so tests can inject a fake runtime.
 *
 * @internal
 */
export interface OrtLike {
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => OrtTensorLike;
  InferenceSession: {
    create(pathOrBuffer: string | Uint8Array, options?: unknown): Promise<OrtSessionLike>;
  };
}

/** @internal */
export interface OrtTensorLike {
  data: ArrayLike<unknown>;
}

/** @internal */
export interface OrtSessionLike {
  inputNames: readonly string[];
  run(feeds: Record<string, OrtTensorLike>): Promise<Record<string, OrtTensorLike>>;
  release?(): Promise<void>;
}

/**
 * Options for {@link SileroVAD}.
 */
export interface SileroVADOptions {
  /**
   * Where to load the model from.
   *
   * @remarks
   * A URL in browsers; a URL or filesystem path in Node.
   *
   * @defaultValue {@link DEFAULT_SILERO_MODEL_URL}
   */
  modelUrl?: string;

  /**
   * Which ONNX Runtime package to load.
   *
   * @remarks
   * `'auto'` picks `onnxruntime-web` when a `window` global exists and
   * `onnxruntime-node` otherwise.
   *
   * @defaultValue `'auto'`
   */
  runtime?: 'auto' | 'web' | 'node';

  /**
   * Inject an ONNX Runtime implementation directly, bypassing the peer
   * dependency import.
   *
   * @remarks
   * Intended for tests and advanced embedding scenarios (e.g. a bundler
   * that provides its own ORT instance).
   *
   * @internal
   */
  ort?: OrtLike;
}

/**
 * Local Silero voice-activity-detection engine.
 *
 * @remarks
 * Stateful across frames — call {@link reset} between listening sessions
 * so one session's trailing state does not bias the next.
 *
 * @example
 * ```typescript
 * const vad = new SileroVAD({ modelUrl: '/models/silero_vad_v5.onnx' });
 * await vad.initialize();
 *
 * const probability = await vad.process(frame); // Float32Array(512) @ 16 kHz
 * if (probability > 0.5) console.log('speech!');
 * ```
 *
 * @see {@link VADEngine} for the interface contract
 * @see {@link VADProcessor} for the framing/hysteresis layer that drives this engine
 */
export class SileroVAD implements VADEngine {
  readonly frameSamples = SILERO_FRAME_SAMPLES;
  readonly sampleRate = SILERO_SAMPLE_RATE;

  private readonly options: SileroVADOptions;
  private ort: OrtLike | null = null;
  private session: OrtSessionLike | null = null;

  /** `'v5'` uses a single `state` tensor; `'v4'` uses `h`/`c`. */
  private modelVersion: 'v4' | 'v5' = 'v5';

  // Recurrent state
  private state: Float32Array | null = null; // v5: [2*1*128]
  private h: Float32Array | null = null; // v4: [2*1*64]
  private c: Float32Array | null = null; // v4: [2*1*64]

  /** v5 leading context — the last 64 samples of the previous frame. */
  private context: Float32Array = new Float32Array(V5_CONTEXT_SAMPLES);

  /** Serializes inference so recurrent state updates stay ordered. */
  private inferenceChain: Promise<unknown> = Promise.resolve();

  /**
   * Bumped by {@link reset}; inferences that started before the bump
   * discard their recurrent-state writes so pre-reset frames cannot
   * resurrect stale state.
   */
  private generation = 0;

  constructor(options: SileroVADOptions = {}) {
    this.options = options;
  }

  /**
   * Load ONNX Runtime and the Silero model, and detect the model version.
   *
   * @throws {@link ProviderInitializationError} when the ONNX Runtime peer
   *   dependency is not installed.
   * @throws Error when the model cannot be fetched or has an unrecognized
   *   input signature.
   */
  async initialize(): Promise<void> {
    if (this.session) return;

    this.ort = this.options.ort ?? (await this.loadOrt());

    const modelUrl = this.options.modelUrl ?? DEFAULT_SILERO_MODEL_URL;
    const session = await this.ort.InferenceSession.create(modelUrl);

    // Validate before caching the session, so a rejected model does not
    // leave `initialize()` short-circuiting on a session we can't use.
    const inputs = session.inputNames;
    let modelVersion: 'v4' | 'v5';
    if (inputs.includes('state')) {
      modelVersion = 'v5';
    } else if (inputs.includes('h') && inputs.includes('c')) {
      modelVersion = 'v4';
    } else {
      try {
        await session.release?.();
      } catch {
        /* releasing a rejected session is best-effort */
      }
      throw new Error(
        `SileroVAD: unrecognized model input signature [${inputs.join(', ')}] — ` +
          'expected a Silero VAD v5 ("state") or v4 ("h"/"c") ONNX export'
      );
    }

    this.session = session;
    this.modelVersion = modelVersion;
    this.reset();
  }

  /**
   * Score one 512-sample frame, updating recurrent state.
   *
   * @param frame - Exactly 512 mono samples in [-1, 1] at 16 kHz.
   * @returns Speech probability in [0, 1].
   */
  process(frame: Float32Array): Promise<number> {
    // Chain inferences so concurrent callers cannot interleave state updates.
    const result = this.inferenceChain.then(() => this.runInference(frame));
    this.inferenceChain = result.catch(() => undefined);
    return result;
  }

  private async runInference(frame: Float32Array): Promise<number> {
    const ort = this.ort;
    const session = this.session;
    if (!ort || !session) {
      throw new Error('SileroVAD is not initialized. Call initialize() first.');
    }
    if (frame.length !== SILERO_FRAME_SAMPLES) {
      throw new Error(
        `SileroVAD: expected ${SILERO_FRAME_SAMPLES}-sample frames, got ${frame.length}`
      );
    }

    const srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(SILERO_SAMPLE_RATE)]), [1]);

    let feeds: Record<string, OrtTensorLike>;
    if (this.modelVersion === 'v5') {
      // v5 input: [1, 64 context + 512 frame]
      const input = new Float32Array(V5_CONTEXT_SAMPLES + SILERO_FRAME_SAMPLES);
      input.set(this.context, 0);
      input.set(frame, V5_CONTEXT_SAMPLES);

      feeds = {
        input: new ort.Tensor('float32', input, [1, input.length]),
        state: new ort.Tensor('float32', this.state ?? new Float32Array(2 * 1 * 128), [2, 1, 128]),
        sr: srTensor,
      };
    } else {
      feeds = {
        input: new ort.Tensor('float32', frame, [1, frame.length]),
        h: new ort.Tensor('float32', this.h ?? new Float32Array(2 * 1 * 64), [2, 1, 64]),
        c: new ort.Tensor('float32', this.c ?? new Float32Array(2 * 1 * 64), [2, 1, 64]),
        sr: srTensor,
      };
    }

    const generation = this.generation;
    const results = await session.run(feeds);

    // Skip the state write if reset() ran while this inference was in
    // flight — otherwise a pre-reset frame resurrects the state we cleared.
    if (generation === this.generation) {
      // Carry recurrent state into the next frame
      if (this.modelVersion === 'v5') {
        const stateN = results.stateN ?? results.state;
        if (stateN) {
          this.state = Float32Array.from(stateN.data as ArrayLike<number>);
        }
        this.context = frame.slice(SILERO_FRAME_SAMPLES - V5_CONTEXT_SAMPLES);
      } else {
        if (results.hn) this.h = Float32Array.from(results.hn.data as ArrayLike<number>);
        if (results.cn) this.c = Float32Array.from(results.cn.data as ArrayLike<number>);
      }
    }

    const output = results.output ?? results[Object.keys(results)[0] ?? ''];
    const probability = Number(output?.data[0] ?? 0);
    return Math.min(1, Math.max(0, probability));
  }

  reset(): void {
    this.generation++;
    this.state = new Float32Array(2 * 1 * 128);
    this.h = new Float32Array(2 * 1 * 64);
    this.c = new Float32Array(2 * 1 * 64);
    this.context = new Float32Array(V5_CONTEXT_SAMPLES);
  }

  async dispose(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.ort = null;
    if (session?.release) {
      await session.release();
    }
  }

  /**
   * Import the ONNX Runtime peer dependency for the configured runtime.
   *
   * @remarks
   * Literal import specifiers are required so bundlers can statically
   * resolve them — see {@link importPeerDep}.
   */
  private async loadOrt(): Promise<OrtLike> {
    let runtime = this.options.runtime ?? 'auto';
    if (runtime === 'auto') {
      runtime = typeof window !== 'undefined' ? 'web' : 'node';
    }

    if (runtime === 'web') {
      return importPeerDep<OrtLike>(
        () => import('onnxruntime-web'),
        'onnxruntime-web',
        'SileroVAD'
      );
    }
    return importPeerDep<OrtLike>(
      () => import('onnxruntime-node'),
      'onnxruntime-node',
      'SileroVAD'
    );
  }
}
