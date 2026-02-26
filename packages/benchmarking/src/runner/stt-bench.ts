/**
 * STT benchmark runner — Section 5.2 of METHODOLOGY.md
 *
 * Measures Time to First Partial, Time to Final Transcript,
 * Transcription Latency, Word Error Rate, and confidence scores
 * for STT providers using pre-recorded audio.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { STTAlignmentConfig, RunnerConfig } from '../types/config.js';
import type { STTMetrics } from '../types/schema.js';
import { computeSummary } from '../stats/summary.js';
import { computeWER } from '../stats/wer.js';
import { RawLogWriter } from '../results/raw-log.js';

export interface STTTrialResult {
  ttfp: number;
  ttft: number;
  transcriptionLatency: number;
  wer: number;
  confidence: number;
  error: boolean;
}

/**
 * Instantiate the correct STT provider based on assignment.
 */
async function createProvider(config: RunnerConfig) {
  const alignment = config.alignment as STTAlignmentConfig;
  const common = {
    language: alignment.language,
    interimResults: alignment.interimResults,
  };

  switch (config.assignment.provider) {
    case 'deepgram': {
      const { DeepgramSTT } = await import(
        '@lukeocodes/composite-voice/providers/stt'
      );
      return new DeepgramSTT({
        ...common,
        apiKey: config.apiKey,
        options: {
          model: config.assignment.model,
          encoding: alignment.encoding,
          sampleRate: alignment.sampleRate,
          channels: alignment.channels,
          punctuation: alignment.punctuation,
          profanityFilter: alignment.profanityFilter,
          diarize: alignment.diarize,
          smartFormat: alignment.smartFormat,
          redact: alignment.redact.length > 0 ? alignment.redact : undefined,
          keywords: alignment.keywords.length > 0 ? alignment.keywords : undefined,
          vadEvents: alignment.vadEvents,
        },
      });
    }
    case 'assemblyai': {
      const { AssemblyAISTT } = await import(
        '@lukeocodes/composite-voice/providers/stt'
      );
      return new AssemblyAISTT({
        ...common,
        apiKey: config.apiKey,
        sampleRate: alignment.sampleRate,
      });
    }
    default:
      throw new Error(`Unknown STT provider: ${config.assignment.provider}`);
  }
}

/**
 * Load a single audio file as PCM ArrayBuffer.
 */
function loadAudioFile(filePath: string): ArrayBuffer {
  const buffer = fs.readFileSync(filePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Send audio at real-time rate (Section 5.2.2).
 *
 * Chunk size: 4096 bytes (256ms at 16kHz/16-bit/mono).
 * Pacing: one chunk every 256ms.
 */
async function sendAudioRealtime(
  provider: { sendAudio: (chunk: ArrayBuffer) => void },
  audio: ArrayBuffer,
): Promise<{ sendStart: number; sendEnd: number }> {
  const CHUNK_SIZE = 4096;
  const CHUNK_INTERVAL_MS = 256;
  const sendStart = Date.now();

  for (let offset = 0; offset < audio.byteLength; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, audio.byteLength);
    const chunk = audio.slice(offset, end);
    provider.sendAudio(chunk);

    if (end < audio.byteLength) {
      await sleep(CHUNK_INTERVAL_MS);
    }
  }

  return { sendStart, sendEnd: Date.now() };
}

/**
 * Run a single STT trial with one audio file.
 */
async function runTrial(
  provider: {
    connect: () => Promise<void>;
    sendAudio: (chunk: ArrayBuffer) => void;
    disconnect: () => Promise<void>;
    onTranscription: (cb: (result: TranscriptionResult) => void) => void;
  },
  audioPath: string,
  reference: string,
  trialIndex: number,
  inputId: string,
  log: RawLogWriter,
  runId: string,
  timeoutMs: number,
): Promise<STTTrialResult> {
  const audio = loadAudioFile(audioPath);

  return new Promise<STTTrialResult>(async (resolve) => {
    let firstPartialTime: number | null = null;
    let finalText = '';
    let finalConfidence = 0;
    let speechFinalTime: number | null = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        log.write({
          runId,
          trialIndex,
          inputId,
          event: { type: 'transcription.error', error: 'Timeout', recoverable: false, timestamp: Date.now() },
        });
        resolve({ ttfp: 0, ttft: 0, transcriptionLatency: 0, wer: 1, confidence: 0, error: true });
      }
    }, timeoutMs);

    provider.onTranscription((result: TranscriptionResult) => {
      const now = Date.now();

      if (!result.isFinal && firstPartialTime === null) {
        firstPartialTime = now;
        log.write({
          runId,
          trialIndex,
          inputId,
          event: { type: 'transcription.interim', text: result.text, confidence: result.confidence, timestamp: now },
        });
      }

      if (result.speechFinal || (result.isFinal && result.speechFinal !== false)) {
        speechFinalTime = now;
        finalText = result.text;
        finalConfidence = result.confidence || 0;

        log.write({
          runId,
          trialIndex,
          inputId,
          event: { type: 'transcription.speechFinal', text: result.text, confidence: result.confidence, timestamp: now },
        });

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          finishTrial();
        }
      }
    });

    const logStart = Date.now();
    log.write({
      runId,
      trialIndex,
      inputId,
      event: { type: 'transcription.start', timestamp: logStart },
    });

    await provider.connect();
    const { sendStart, sendEnd } = await sendAudioRealtime(provider, audio);
    // Give the provider time to process the final chunk
    await sleep(3000);
    await provider.disconnect();

    // If we haven't resolved yet (no speechFinal), resolve with what we have
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      finishTrial();
    }

    function finishTrial() {
      const wer = computeWER(reference, finalText);
      const ttfp = firstPartialTime !== null ? firstPartialTime - sendStart : 0;
      const ttft = speechFinalTime !== null ? speechFinalTime - sendStart : 0;
      const transcriptionLatency = speechFinalTime !== null ? speechFinalTime - sendEnd : 0;

      resolve({
        ttfp,
        ttft,
        transcriptionLatency,
        wer: wer * 100, // Convert to percentage
        confidence: finalConfidence,
        error: false,
      });
    }
  });
}

// Minimal type to avoid importing from the SDK at the module level
interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  speechFinal?: boolean;
  confidence?: number;
}

/**
 * Load the dataset manifest: list of (audioPath, reference) pairs.
 * Expects the dataset directory to contain utterance directories with
 * .flac/.pcm files and .trans.txt transcription files.
 *
 * TODO: Implement full LibriSpeech directory walker.
 * For now, expects a manifest.json in the dataset path.
 */
function loadDataset(datasetPath: string): Array<{ id: string; audioPath: string; reference: string }> {
  const manifestPath = path.join(datasetPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  throw new Error(`Dataset manifest not found: ${manifestPath}`);
}

/**
 * Run the full STT benchmark protocol.
 */
export async function runSTTBenchmark(
  config: RunnerConfig,
  log: RawLogWriter,
  runId: string,
): Promise<{ metrics: STTMetrics; trialCount: number; errorCount: number }> {
  const provider = await createProvider(config);
  await provider.initialize();

  const samples = loadDataset(config.dataset.path);

  // Warm-up (Section 5.1.1)
  for (let i = 0; i < config.warmUpTrials; i++) {
    if (samples.length > 0) {
      try {
        const warmupAudio = loadAudioFile(samples[0].audioPath);
        await provider.connect();
        provider.sendAudio(warmupAudio);
        await sleep(2000);
        await provider.disconnect();
      } catch {
        /* ignore warm-up errors */
      }
    }
    await sleep(config.cooldownMs);
  }

  // Run trials
  const results: STTTrialResult[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const result = await runTrial(
      provider,
      sample.audioPath,
      sample.reference,
      i,
      sample.id,
      log,
      runId,
      config.timeoutMs,
    );
    results.push(result);

    if (i < samples.length - 1) {
      await sleep(config.cooldownMs);
    }
  }

  await provider.dispose();

  const successful = results.filter((r) => !r.error);
  const errorCount = results.filter((r) => r.error).length;

  return {
    metrics: {
      ttfp: computeSummary(successful.map((r) => r.ttfp), 'ms'),
      ttft: computeSummary(successful.map((r) => r.ttft), 'ms'),
      transcriptionLatency: computeSummary(successful.map((r) => r.transcriptionLatency), 'ms'),
      wer: computeSummary(successful.map((r) => r.wer), 'percent'),
      confidence: computeSummary(successful.map((r) => r.confidence), 'score'),
      errorRate: computeSummary([errorCount / results.length * 100], 'percent'),
    },
    trialCount: results.length,
    errorCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
