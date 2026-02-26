/**
 * TTS benchmark runner — Section 5.4 of METHODOLOGY.md
 *
 * Measures Time to First Audio, Total Synthesis Time, audio chunk
 * throughput, and inter-chunk latency for TTS providers.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TTSAlignmentConfig, RunnerConfig } from '../types/config.js';
import type { TTSMetrics } from '../types/schema.js';
import { computeSummary } from '../stats/summary.js';
import { RawLogWriter } from '../results/raw-log.js';

export interface TTSTrialResult {
  ttfa: number;
  tst: number;
  audioChunkCount: number;
  audioDataVolume: number;
  synthesisThroughput: number;
  icl: number;
  error: boolean;
}

interface AudioChunk {
  data: ArrayBuffer;
  timestamp?: number;
}

/**
 * Detect whether a provider uses WebSocket (live) or REST transport.
 */
function isLiveProvider(providerName: string): boolean {
  return ['deepgram', 'elevenlabs', 'cartesia'].includes(providerName);
}

/**
 * Instantiate the correct TTS provider based on assignment.
 */
async function createProvider(config: RunnerConfig) {
  const alignment = config.alignment as TTSAlignmentConfig;

  switch (config.assignment.provider) {
    case 'deepgram': {
      const { DeepgramTTS } = await import(
        '@lukeocodes/composite-voice/providers/tts'
      );
      return new DeepgramTTS({
        apiKey: config.apiKey,
        voice: config.assignment.model,
        sampleRate: alignment.sampleRate,
        outputFormat: alignment.encoding,
      });
    }
    case 'openai': {
      const { OpenAITTS } = await import(
        '@lukeocodes/composite-voice/providers/tts'
      );
      return new OpenAITTS({
        apiKey: config.apiKey,
        model: config.assignment.model,
        voice: 'nova',
        responseFormat: 'wav',
        speed: alignment.speed,
      });
    }
    case 'elevenlabs': {
      const { ElevenLabsTTS } = await import(
        '@lukeocodes/composite-voice/providers/tts'
      );
      return new ElevenLabsTTS({
        apiKey: config.apiKey,
        voiceId: (config.providerConfig.voiceId as string) || '21m00Tcm4TlvDq8ikWAM',
        modelId: config.assignment.model,
        outputFormat: `pcm_${alignment.sampleRate}`,
        stability: 0.5,
        similarityBoost: 0.75,
      });
    }
    case 'cartesia': {
      const { CartesiaTTS } = await import(
        '@lukeocodes/composite-voice/providers/tts'
      );
      return new CartesiaTTS({
        apiKey: config.apiKey,
        voiceId: (config.providerConfig.voiceId as string) || 'a0e99841-438c-4a64-b679-ae501e7d6091',
        modelId: config.assignment.model,
        outputEncoding: 'pcm_s16le',
        outputSampleRate: alignment.sampleRate,
        emotion: [],
      });
    }
    default:
      throw new Error(`Unknown TTS provider: ${config.assignment.provider}`);
  }
}

/**
 * Run a single trial with a live (WebSocket) TTS provider.
 */
async function runLiveTrial(
  provider: {
    connect: () => Promise<void>;
    sendText: (text: string) => void;
    finalize: () => Promise<void>;
    disconnect: () => Promise<void>;
    onAudio: (cb: (chunk: AudioChunk) => void) => void;
  },
  text: string,
  wordCount: number,
  trialIndex: number,
  inputId: string,
  log: RawLogWriter,
  runId: string,
  timeoutMs: number,
): Promise<TTSTrialResult> {
  return new Promise<TTSTrialResult>(async (resolve) => {
    let firstAudioTime: number | null = null;
    let chunkCount = 0;
    let totalBytes = 0;
    const chunkTimestamps: number[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        log.write({ runId, trialIndex, inputId, event: { type: 'tts.error', error: 'Timeout', recoverable: false, timestamp: Date.now() } });
        resolve({ ttfa: 0, tst: 0, audioChunkCount: 0, audioDataVolume: 0, synthesisThroughput: 0, icl: 0, error: true });
      }
    }, timeoutMs);

    provider.onAudio((chunk: AudioChunk) => {
      const now = Date.now();
      if (firstAudioTime === null) firstAudioTime = now;
      chunkTimestamps.push(now);
      chunkCount++;
      totalBytes += chunk.data.byteLength;

      log.write({ runId, trialIndex, inputId, event: { type: 'tts.audio', byteLength: chunk.data.byteLength, timestamp: now } });
    });

    const startTime = Date.now();
    log.write({ runId, trialIndex, inputId, event: { type: 'tts.start', text, timestamp: startTime } });

    try {
      await provider.connect();
      provider.sendText(text);
      await provider.finalize();
      await provider.disconnect();
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        log.write({ runId, trialIndex, inputId, event: { type: 'tts.error', error: err instanceof Error ? err.message : String(err), recoverable: false, timestamp: Date.now() } });
        resolve({ ttfa: 0, tst: 0, audioChunkCount: 0, audioDataVolume: 0, synthesisThroughput: 0, icl: 0, error: true });
      }
      return;
    }

    const endTime = Date.now();
    log.write({ runId, trialIndex, inputId, event: { type: 'tts.complete', timestamp: endTime } });

    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);

      const tst = endTime - startTime;
      const ttfa = firstAudioTime !== null ? firstAudioTime - startTime : tst;
      const synthesisThroughput = tst > 0 ? (wordCount / tst) * 1000 : 0;

      let icl = 0;
      if (chunkTimestamps.length > 1) {
        const deltas: number[] = [];
        for (let i = 1; i < chunkTimestamps.length; i++) {
          deltas.push(chunkTimestamps[i] - chunkTimestamps[i - 1]);
        }
        icl = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      }

      resolve({ ttfa, tst, audioChunkCount: chunkCount, audioDataVolume: totalBytes, synthesisThroughput, icl, error: false });
    }
  });
}

/**
 * Run a single trial with a REST TTS provider (e.g., OpenAI).
 */
async function runRestTrial(
  provider: { synthesize: (text: string) => Promise<Blob> },
  text: string,
  wordCount: number,
  trialIndex: number,
  inputId: string,
  log: RawLogWriter,
  runId: string,
  timeoutMs: number,
): Promise<TTSTrialResult> {
  const startTime = Date.now();
  log.write({ runId, trialIndex, inputId, event: { type: 'tts.start', text, timestamp: startTime } });

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TTS timeout')), timeoutMs),
    );
    const synthesize = provider.synthesize(text);
    const blob = await Promise.race([synthesize, timeout]);

    const endTime = Date.now();
    const arrayBuffer = await blob.arrayBuffer();

    log.write({ runId, trialIndex, inputId, event: { type: 'tts.audio', byteLength: arrayBuffer.byteLength, timestamp: endTime } });
    log.write({ runId, trialIndex, inputId, event: { type: 'tts.complete', timestamp: endTime } });

    const tst = endTime - startTime;

    return {
      ttfa: tst, // REST: TTFA === TST (single blob response)
      tst,
      audioChunkCount: 1,
      audioDataVolume: arrayBuffer.byteLength,
      synthesisThroughput: tst > 0 ? (wordCount / tst) * 1000 : 0,
      icl: 0, // No inter-chunk for REST
      error: false,
    };
  } catch (err) {
    const now = Date.now();
    log.write({ runId, trialIndex, inputId, event: { type: 'tts.error', error: err instanceof Error ? err.message : String(err), recoverable: false, timestamp: now } });
    return { ttfa: 0, tst: now - startTime, audioChunkCount: 0, audioDataVolume: 0, synthesisThroughput: 0, icl: 0, error: true };
  }
}

/**
 * Load TTS text samples from the dataset.
 * Expects a manifest.json with { id, text, wordCount } entries.
 */
function loadTextSamples(datasetPath: string): Array<{ id: string; text: string; wordCount: number }> {
  const manifestPath = path.join(datasetPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  throw new Error(`Dataset manifest not found: ${manifestPath}`);
}

/**
 * Run the full TTS benchmark protocol.
 */
export async function runTTSBenchmark(
  config: RunnerConfig,
  log: RawLogWriter,
  runId: string,
): Promise<{ metrics: TTSMetrics; trialCount: number; errorCount: number }> {
  const provider = await createProvider(config);
  await provider.initialize();

  const samples = loadTextSamples(config.dataset.path);
  const runsPerSample = 3; // Section 5.4.4
  const live = isLiveProvider(config.assignment.provider);

  // Warm-up
  for (let i = 0; i < config.warmUpTrials; i++) {
    try {
      if (live) {
        await (provider as any).connect();
        (provider as any).sendText('Hello world.');
        await (provider as any).finalize();
        await (provider as any).disconnect();
      } else {
        await (provider as any).synthesize('Hello world.');
      }
    } catch {
      /* ignore */
    }
    await sleep(config.cooldownMs);
  }

  // Run trials
  const results: TTSTrialResult[] = [];
  let trialIndex = 0;

  for (const sample of samples) {
    for (let run = 0; run < runsPerSample; run++) {
      const result = live
        ? await runLiveTrial(provider as any, sample.text, sample.wordCount, trialIndex, `${sample.id}_run${run}`, log, runId, config.timeoutMs)
        : await runRestTrial(provider as any, sample.text, sample.wordCount, trialIndex, `${sample.id}_run${run}`, log, runId, config.timeoutMs);

      results.push(result);
      trialIndex++;

      if (trialIndex < samples.length * runsPerSample) {
        await sleep(config.cooldownMs);
      }
    }
  }

  await provider.dispose();

  const successful = results.filter((r) => !r.error);
  const errorCount = results.filter((r) => r.error).length;

  return {
    metrics: {
      ttfa: computeSummary(successful.map((r) => r.ttfa), 'ms'),
      tst: computeSummary(successful.map((r) => r.tst), 'ms'),
      audioChunkCount: computeSummary(successful.map((r) => r.audioChunkCount), 'count'),
      audioDataVolume: computeSummary(successful.map((r) => r.audioDataVolume), 'bytes'),
      synthesisThroughput: computeSummary(successful.map((r) => r.synthesisThroughput), 'words/s'),
      icl: computeSummary(successful.map((r) => r.icl), 'ms'),
      errorRate: computeSummary([errorCount / results.length * 100], 'percent'),
    },
    trialCount: results.length,
    errorCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
