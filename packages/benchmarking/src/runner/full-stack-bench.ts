/**
 * Full-stack benchmark runner — Section 5.5 of METHODOLOGY.md
 *
 * Measures the complete voice pipeline: audio input → STT → LLM → TTS → audio output.
 *
 * This is the most complex runner because it chains three providers and
 * measures both individual segment latencies and the critical handoff
 * points between them. For streaming TTS providers, LLM chunks are piped
 * to TTS as they arrive, enabling measurement of Perceived Response Time
 * (PRT) — the most user-relevant metric.
 *
 * Metrics (Section 5.5.4):
 *   E2E             = tts.complete - audio_send_start
 *   PRT             = first tts.audio - transcription.speechFinal
 *   STT Segment     = transcription.speechFinal - audio_send_start
 *   Handoff STT→LLM = llm.start - transcription.speechFinal
 *   LLM Segment     = llm.complete - llm.start
 *   Handoff LLM→TTS = tts.start - llm.start
 *   TTS Segment     = tts.complete - tts.start
 *   Pipeline Overhead = E2E - (STT + LLM + TTS segments)
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  RunnerConfig,
  FullStackAlignmentConfig,
  STTAlignmentConfig,
  LLMAlignmentConfig,
  TTSAlignmentConfig,
  STTProviderName,
  LLMProviderName,
  TTSProviderName,
} from '../types/config.js';
import type { FullStackMetrics } from '../types/schema.js';
import { computeSummary } from '../stats/summary.js';
import { RawLogWriter } from '../results/raw-log.js';

// --- Trial result for one full pipeline pass ---

export interface FullStackTrialResult {
  e2e: number;
  prt: number;
  sttSegment: number;
  handoffSttToLlm: number;
  llmSegment: number;
  handoffLlmToTts: number;
  ttsSegment: number;
  pipelineOverhead: number;
  error: boolean;
}

// --- Minimal provider interfaces (avoid importing SDK types at module level) ---

interface STTProvider {
  initialize(): Promise<void>;
  connect(): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  disconnect(): Promise<void>;
  onTranscription(cb: (result: TranscriptionResult) => void): void;
  dispose(): Promise<void>;
}

interface LLMProvider {
  initialize(): Promise<void>;
  generate(prompt: string): Promise<AsyncIterable<string>>;
  dispose(): Promise<void>;
}

interface LiveTTSProvider {
  kind: 'live';
  initialize(): Promise<void>;
  connect(): Promise<void>;
  sendText(text: string): void;
  finalize(): Promise<void>;
  disconnect(): Promise<void>;
  onAudio(cb: (chunk: { data: ArrayBuffer }) => void): void;
  dispose(): Promise<void>;
}

interface RestTTSProvider {
  kind: 'rest';
  initialize(): Promise<void>;
  synthesize(text: string): Promise<Blob>;
  dispose(): Promise<void>;
}

type TTSProvider = LiveTTSProvider | RestTTSProvider;

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  speechFinal?: boolean;
  confidence?: number;
}

// --- Provider creation ---

async function createSTTProvider(
  providerName: STTProviderName,
  model: string,
  alignment: STTAlignmentConfig,
  apiKey: string,
): Promise<STTProvider> {
  const common = {
    language: alignment.language,
    interimResults: alignment.interimResults,
  };

  switch (providerName) {
    case 'deepgram': {
      const { DeepgramSTT } = await import('@lukeocodes/composite-voice/providers/stt');
      return new DeepgramSTT({
        ...common,
        apiKey,
        options: {
          model,
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
      const { AssemblyAISTT } = await import('@lukeocodes/composite-voice/providers/stt');
      return new AssemblyAISTT({
        ...common,
        apiKey,
        sampleRate: alignment.sampleRate,
      });
    }
    default:
      throw new Error(`Unknown STT provider: ${providerName}`);
  }
}

async function createLLMProvider(
  providerName: LLMProviderName,
  model: string,
  alignment: LLMAlignmentConfig,
  apiKey: string,
): Promise<LLMProvider> {
  const common = {
    model,
    temperature: alignment.temperature,
    maxTokens: alignment.maxTokens,
    topP: alignment.topP,
    systemPrompt: alignment.systemPrompt,
    stream: alignment.stream,
    stopSequences: alignment.stopSequences,
  };

  switch (providerName) {
    case 'anthropic': {
      const { AnthropicLLM } = await import('@lukeocodes/composite-voice/providers/llm');
      return new AnthropicLLM({ ...common, apiKey });
    }
    case 'openai': {
      const { OpenAILLM } = await import('@lukeocodes/composite-voice/providers/llm');
      return new OpenAILLM({ ...common, apiKey });
    }
    case 'groq': {
      const { GroqLLM } = await import('@lukeocodes/composite-voice/providers/llm');
      return new GroqLLM({ ...common, groqApiKey: apiKey });
    }
    case 'mistral': {
      const { MistralLLM } = await import('@lukeocodes/composite-voice/providers/llm');
      return new MistralLLM({ ...common, mistralApiKey: apiKey });
    }
    case 'gemini': {
      const { GeminiLLM } = await import('@lukeocodes/composite-voice/providers/llm');
      return new GeminiLLM({ ...common, geminiApiKey: apiKey });
    }
    default:
      throw new Error(`Unknown LLM provider: ${providerName}`);
  }
}

async function createTTSProvider(
  providerName: TTSProviderName,
  model: string,
  alignment: TTSAlignmentConfig,
  apiKey: string,
  providerConfig: Record<string, unknown>,
): Promise<TTSProvider> {
  switch (providerName) {
    case 'deepgram': {
      const { DeepgramTTS } = await import('@lukeocodes/composite-voice/providers/tts');
      const p = new DeepgramTTS({
        apiKey,
        voice: model,
        sampleRate: alignment.sampleRate,
        outputFormat: alignment.encoding,
      });
      return Object.assign(p, { kind: 'live' as const });
    }
    case 'openai': {
      const { OpenAITTS } = await import('@lukeocodes/composite-voice/providers/tts');
      const p = new OpenAITTS({
        apiKey,
        model,
        voice: 'nova',
        responseFormat: 'wav',
        speed: alignment.speed,
      });
      return Object.assign(p, { kind: 'rest' as const });
    }
    case 'elevenlabs': {
      const { ElevenLabsTTS } = await import('@lukeocodes/composite-voice/providers/tts');
      const p = new ElevenLabsTTS({
        apiKey,
        voiceId: (providerConfig.voiceId as string) || '21m00Tcm4TlvDq8ikWAM',
        modelId: model,
        outputFormat: `pcm_${alignment.sampleRate}`,
        stability: 0.5,
        similarityBoost: 0.75,
      });
      return Object.assign(p, { kind: 'live' as const });
    }
    case 'cartesia': {
      const { CartesiaTTS } = await import('@lukeocodes/composite-voice/providers/tts');
      const p = new CartesiaTTS({
        apiKey,
        voiceId: (providerConfig.voiceId as string) || 'a0e99841-438c-4a64-b679-ae501e7d6091',
        modelId: model,
        outputEncoding: 'pcm_s16le',
        outputSampleRate: alignment.sampleRate,
        emotion: [],
      });
      return Object.assign(p, { kind: 'live' as const });
    }
    default:
      throw new Error(`Unknown TTS provider: ${providerName}`);
  }
}

// --- Audio utilities ---

function loadAudioFile(filePath: string): ArrayBuffer {
  const buffer = fs.readFileSync(filePath);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Send audio at real-time rate (Section 5.2.2).
 * 4096-byte chunks at 256ms intervals (16kHz/16-bit/mono).
 */
async function sendAudioRealtime(
  provider: STTProvider,
  audio: ArrayBuffer,
): Promise<{ sendStart: number; sendEnd: number }> {
  const CHUNK_SIZE = 4096;
  const CHUNK_INTERVAL_MS = 256;
  const sendStart = Date.now();

  for (let offset = 0; offset < audio.byteLength; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, audio.byteLength);
    provider.sendAudio(audio.slice(offset, end));

    if (end < audio.byteLength) {
      await sleep(CHUNK_INTERVAL_MS);
    }
  }

  return { sendStart, sendEnd: Date.now() };
}

// --- The pipeline ---

/**
 * Run a single full-stack trial: audio → STT → LLM → TTS.
 *
 * The pipeline works in three phases:
 *
 * Phase 1 (STT): Feed pre-recorded audio at real-time rate and wait for
 * speechFinal — the canonical trigger for the LLM.
 *
 * Phase 2 (LLM): Send the transcript to the LLM and stream chunks.
 * For live TTS providers, each chunk is forwarded to TTS immediately
 * as it arrives. For REST TTS, we accumulate the full response.
 *
 * Phase 3 (TTS): For live providers, finalize the stream after the LLM
 * completes. For REST providers, synthesize the full response in one call.
 *
 * All timestamps are recorded for the 8 metrics defined in Section 5.5.4.
 */
async function runTrial(
  sttProvider: STTProvider,
  llmProvider: LLMProvider,
  ttsProvider: TTSProvider,
  audioPath: string,
  trialIndex: number,
  inputId: string,
  log: RawLogWriter,
  runId: string,
  timeoutMs: number,
): Promise<FullStackTrialResult> {
  const audio = loadAudioFile(audioPath);

  return new Promise<FullStackTrialResult>(async (resolve) => {
    // Timestamp collection
    let audioSendStart = 0;
    let speechFinalTime = 0;
    let llmStartTime = 0;
    let llmCompleteTime = 0;
    let ttsStartTime = 0;
    let firstTtsAudioTime = 0;
    let ttsCompleteTime = 0;

    let transcript = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        log.write({
          runId, trialIndex, inputId,
          event: { type: 'full-stack.error', error: 'Pipeline timeout', timestamp: Date.now() },
        });
        resolve(errorResult());
      }
    }, timeoutMs);

    function finishWith(result: FullStackTrialResult) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      }
    }

    function errorResult(): FullStackTrialResult {
      return {
        e2e: 0, prt: 0, sttSegment: 0, handoffSttToLlm: 0,
        llmSegment: 0, handoffLlmToTts: 0, ttsSegment: 0,
        pipelineOverhead: 0, error: true,
      };
    }

    try {
      // ── Phase 1: STT ──────────────────────────────────────────────

      const sttTranscript = await new Promise<string>(async (resolveStt, rejectStt) => {
        let sttResolved = false;

        sttProvider.onTranscription((result: TranscriptionResult) => {
          const now = Date.now();

          if (!result.isFinal) {
            log.write({
              runId, trialIndex, inputId,
              event: { type: 'transcription.interim', text: result.text, timestamp: now },
            });
          }

          if (result.speechFinal || (result.isFinal && result.speechFinal !== false)) {
            speechFinalTime = now;
            log.write({
              runId, trialIndex, inputId,
              event: {
                type: 'transcription.speechFinal',
                text: result.text,
                confidence: result.confidence,
                timestamp: now,
              },
            });

            if (!sttResolved) {
              sttResolved = true;
              resolveStt(result.text);
            }
          }
        });

        log.write({
          runId, trialIndex, inputId,
          event: { type: 'transcription.start', timestamp: Date.now() },
        });

        await sttProvider.connect();
        const timing = await sendAudioRealtime(sttProvider, audio);
        audioSendStart = timing.sendStart;

        // Wait for speechFinal or timeout after audio finishes
        await sleep(5000);
        await sttProvider.disconnect();

        if (!sttResolved) {
          sttResolved = true;
          rejectStt(new Error('No speechFinal received'));
        }
      });

      transcript = sttTranscript;

      // ── Phase 2: LLM ──────────────────────────────────────────────

      llmStartTime = Date.now();
      log.write({
        runId, trialIndex, inputId,
        event: { type: 'llm.start', prompt: transcript, timestamp: llmStartTime },
      });

      const llmStream = await llmProvider.generate(transcript);
      let fullResponse = '';
      let isFirstLlmChunk = true;

      // For live TTS: connect and prepare to receive chunks
      if (ttsProvider.kind === 'live') {
        ttsProvider.onAudio((chunk) => {
          const now = Date.now();
          if (firstTtsAudioTime === 0) firstTtsAudioTime = now;
          log.write({
            runId, trialIndex, inputId,
            event: { type: 'tts.audio', byteLength: chunk.data.byteLength, timestamp: now },
          });
        });

        await ttsProvider.connect();
        ttsStartTime = Date.now();
        log.write({
          runId, trialIndex, inputId,
          event: { type: 'tts.start', text: '(streaming)', timestamp: ttsStartTime },
        });
      }

      // Consume LLM stream, forwarding to live TTS as chunks arrive
      for await (const chunk of llmStream) {
        const now = Date.now();

        if (isFirstLlmChunk) {
          isFirstLlmChunk = false;
          // If TTS hasn't started yet (live provider connect was fast),
          // record the TTS start as the first chunk forwarding time
          if (ttsStartTime === 0) ttsStartTime = now;
        }

        fullResponse += chunk;

        log.write({
          runId, trialIndex, inputId,
          event: { type: 'llm.chunk', chunk, accumulated: fullResponse, timestamp: now },
        });

        // Forward to live TTS immediately
        if (ttsProvider.kind === 'live') {
          ttsProvider.sendText(chunk);
        }
      }

      llmCompleteTime = Date.now();
      log.write({
        runId, trialIndex, inputId,
        event: { type: 'llm.complete', text: fullResponse, timestamp: llmCompleteTime },
      });

      // ── Phase 3: TTS ──────────────────────────────────────────────

      if (ttsProvider.kind === 'live') {
        // Signal end of text and wait for remaining audio
        await ttsProvider.finalize();
        await ttsProvider.disconnect();

        ttsCompleteTime = Date.now();
      } else {
        // REST TTS: synthesize the complete response as a single call
        ttsStartTime = Date.now();
        log.write({
          runId, trialIndex, inputId,
          event: { type: 'tts.start', text: fullResponse, timestamp: ttsStartTime },
        });

        const blob = await ttsProvider.synthesize(fullResponse);
        const arrayBuffer = await blob.arrayBuffer();

        ttsCompleteTime = Date.now();
        firstTtsAudioTime = ttsCompleteTime; // REST: first audio = complete

        log.write({
          runId, trialIndex, inputId,
          event: { type: 'tts.audio', byteLength: arrayBuffer.byteLength, timestamp: ttsCompleteTime },
        });
      }

      log.write({
        runId, trialIndex, inputId,
        event: { type: 'tts.complete', timestamp: ttsCompleteTime },
      });

      // ── Compute metrics ────────────────────────────────────────────

      const e2e = ttsCompleteTime - audioSendStart;
      const prt = firstTtsAudioTime > 0 ? firstTtsAudioTime - speechFinalTime : e2e;
      const sttSegment = speechFinalTime - audioSendStart;
      const handoffSttToLlm = llmStartTime - speechFinalTime;
      const llmSegment = llmCompleteTime - llmStartTime;
      const handoffLlmToTts = ttsStartTime - llmStartTime;
      const ttsSegment = ttsCompleteTime - ttsStartTime;
      const pipelineOverhead = e2e - (sttSegment + llmSegment + ttsSegment);

      finishWith({
        e2e,
        prt,
        sttSegment,
        handoffSttToLlm,
        llmSegment,
        handoffLlmToTts,
        ttsSegment,
        pipelineOverhead,
        error: false,
      });
    } catch (err) {
      log.write({
        runId, trialIndex, inputId,
        event: {
          type: 'full-stack.error',
          error: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        },
      });
      finishWith(errorResult());
    }
  });
}

// --- Dataset loading ---

/**
 * Load the full-stack dataset manifest.
 *
 * Section 5.5.3: 100 utterances from LibriSpeech test-clean, stratified
 * by duration (25 short <5s, 25 medium 5-10s, 25 long 10-20s, 25 very long >20s).
 *
 * Expects a manifest.json at the dataset path with:
 *   { id: string, audioPath: string, reference: string, durationSec: number }[]
 */
function loadDataset(datasetPath: string): Array<{
  id: string;
  audioPath: string;
  reference: string;
  durationSec: number;
}> {
  const manifestPath = path.join(datasetPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
  throw new Error(`Dataset manifest not found: ${manifestPath}`);
}

// --- Warm-up ---

/**
 * Warm up all three providers (Section 5.1.1).
 *
 * Runs a minimal pass through each provider independently to prime
 * connections, TLS handshakes, and JIT paths. Does not run a full
 * pipeline — each provider is warmed individually.
 */
async function warmUp(
  sttProvider: STTProvider,
  llmProvider: LLMProvider,
  ttsProvider: TTSProvider,
  warmUpTrials: number,
  cooldownMs: number,
): Promise<void> {
  for (let i = 0; i < warmUpTrials; i++) {
    // Warm STT: connect and immediately disconnect
    try {
      await sttProvider.connect();
      await sttProvider.disconnect();
    } catch { /* ignore */ }

    // Warm LLM: short generation
    try {
      const stream = await llmProvider.generate('Hello');
      for await (const _ of stream) { /* drain */ }
    } catch { /* ignore */ }

    // Warm TTS: short synthesis
    try {
      if (ttsProvider.kind === 'live') {
        await ttsProvider.connect();
        ttsProvider.sendText('Hello.');
        await ttsProvider.finalize();
        await ttsProvider.disconnect();
      } else {
        await ttsProvider.synthesize('Hello.');
      }
    } catch { /* ignore */ }

    await sleep(cooldownMs);
  }
}

// --- Main benchmark function ---

/**
 * Run the full-stack benchmark protocol (Section 5.5).
 *
 * Instantiates all three providers from the provider triple, warms them
 * up independently, then runs each dataset sample through the complete
 * pipeline: audio → STT → LLM → TTS.
 */
export async function runFullStackBenchmark(
  config: RunnerConfig,
  log: RawLogWriter,
  runId: string,
): Promise<{ metrics: FullStackMetrics; trialCount: number; errorCount: number }> {
  const triple = config.assignment.providerTriple;
  if (!triple) {
    throw new Error('Full-stack benchmark requires a providerTriple in the assignment');
  }

  const alignment = config.alignment as FullStackAlignmentConfig;
  const apiKeys = config.apiKeys || {};

  // Instantiate all three providers
  console.log(`[bench:full-stack] Creating providers: ${triple.stt.provider}/${triple.stt.model} → ${triple.llm.provider}/${triple.llm.model} → ${triple.tts.provider}/${triple.tts.model}`);

  const sttProvider = await createSTTProvider(
    triple.stt.provider,
    triple.stt.model,
    alignment.stt,
    apiKeys[triple.stt.provider] || '',
  );

  const llmProvider = await createLLMProvider(
    triple.llm.provider,
    triple.llm.model,
    alignment.llm,
    apiKeys[triple.llm.provider] || '',
  );

  const ttsProvider = await createTTSProvider(
    triple.tts.provider,
    triple.tts.model,
    alignment.tts,
    apiKeys[triple.tts.provider] || '',
    config.providerConfig,
  );

  // Initialize all providers
  await Promise.all([
    sttProvider.initialize(),
    llmProvider.initialize(),
    ttsProvider.initialize(),
  ]);

  // Load dataset
  const samples = loadDataset(config.dataset.path);
  console.log(`[bench:full-stack] Loaded ${samples.length} samples from ${config.dataset.name}-${config.dataset.subset}`);

  // Warm up (Section 5.1.1)
  console.log(`[bench:full-stack] Warming up (${config.warmUpTrials} trials)...`);
  await warmUp(sttProvider, llmProvider, ttsProvider, config.warmUpTrials, config.cooldownMs);

  // Run trials
  const results: FullStackTrialResult[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    console.log(`[bench:full-stack] Trial ${i + 1}/${samples.length}: ${sample.id} (${sample.durationSec}s)`);

    const result = await runTrial(
      sttProvider,
      llmProvider,
      ttsProvider,
      sample.audioPath,
      i,
      sample.id,
      log,
      runId,
      config.timeoutMs,
    );

    results.push(result);

    if (!result.error) {
      console.log(
        `[bench:full-stack]   E2E=${result.e2e}ms PRT=${result.prt}ms ` +
        `STT=${result.sttSegment}ms LLM=${result.llmSegment}ms TTS=${result.ttsSegment}ms`,
      );
    } else {
      console.log(`[bench:full-stack]   ERROR`);
    }

    // Cooldown between trials (Section 5.1.2)
    if (i < samples.length - 1) {
      await sleep(config.cooldownMs);
    }
  }

  // Dispose all providers
  await Promise.all([
    sttProvider.dispose(),
    llmProvider.dispose(),
    ttsProvider.dispose(),
  ]);

  // Compute metrics
  const successful = results.filter((r) => !r.error);
  const errorCount = results.filter((r) => r.error).length;

  return {
    metrics: {
      e2e: computeSummary(successful.map((r) => r.e2e), 'ms'),
      prt: computeSummary(successful.map((r) => r.prt), 'ms'),
      sttSegment: computeSummary(successful.map((r) => r.sttSegment), 'ms'),
      handoffSttToLlm: computeSummary(successful.map((r) => r.handoffSttToLlm), 'ms'),
      llmSegment: computeSummary(successful.map((r) => r.llmSegment), 'ms'),
      handoffLlmToTts: computeSummary(successful.map((r) => r.handoffLlmToTts), 'ms'),
      ttsSegment: computeSummary(successful.map((r) => r.ttsSegment), 'ms'),
      pipelineOverhead: computeSummary(successful.map((r) => r.pipelineOverhead), 'ms'),
      errorRate: computeSummary([errorCount / results.length * 100], 'percent'),
    },
    trialCount: results.length,
    errorCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
