/**
 * LLM benchmark runner — Section 5.3 of METHODOLOGY.md
 *
 * Measures Time to First Token, Total Generation Time, Tokens Per Second,
 * Inter-Token Latency, and output characteristics for LLM providers.
 */

import type { LLMAlignmentConfig, RunnerConfig } from '../types/config.js';
import type { LLMMetrics } from '../types/schema.js';
import { computeSummary } from '../stats/summary.js';
import { RawLogWriter, type RawLogEvent } from '../results/raw-log.js';

export interface LLMTrialResult {
  ttft: number;
  tgt: number;
  tps: number;
  itl: number;
  outputLength: number;
  tokenCount: number;
  error: boolean;
}

/**
 * Instantiate the correct LLM provider based on assignment.
 */
async function createProvider(config: RunnerConfig) {
  const alignment = config.alignment as LLMAlignmentConfig;
  const common = {
    model: config.assignment.model,
    temperature: alignment.temperature,
    maxTokens: alignment.maxTokens,
    topP: alignment.topP,
    systemPrompt: alignment.systemPrompt,
    stream: alignment.stream,
    stopSequences: alignment.stopSequences,
  };

  switch (config.assignment.provider) {
    case 'anthropic': {
      const { AnthropicLLM } = await import(
        '@lukeocodes/composite-voice/providers/llm'
      );
      return new AnthropicLLM({
        ...common,
        apiKey: config.apiKey,
      });
    }
    case 'openai': {
      const { OpenAILLM } = await import(
        '@lukeocodes/composite-voice/providers/llm'
      );
      return new OpenAILLM({
        ...common,
        apiKey: config.apiKey,
      });
    }
    case 'groq': {
      const { GroqLLM } = await import(
        '@lukeocodes/composite-voice/providers/llm'
      );
      return new GroqLLM({
        ...common,
        groqApiKey: config.apiKey,
      });
    }
    case 'mistral': {
      const { MistralLLM } = await import(
        '@lukeocodes/composite-voice/providers/llm'
      );
      return new MistralLLM({
        ...common,
        mistralApiKey: config.apiKey,
      });
    }
    case 'gemini': {
      const { GeminiLLM } = await import(
        '@lukeocodes/composite-voice/providers/llm'
      );
      return new GeminiLLM({
        ...common,
        geminiApiKey: config.apiKey,
      });
    }
    default:
      throw new Error(`Unknown LLM provider: ${config.assignment.provider}`);
  }
}

/**
 * Run a single LLM trial with a prompt.
 */
async function runTrial(
  provider: { generate: (prompt: string) => Promise<AsyncIterable<string>> },
  prompt: string,
  trialIndex: number,
  inputId: string,
  log: RawLogWriter,
  runId: string,
  timeoutMs: number,
): Promise<LLMTrialResult> {
  const startTime = Date.now();

  log.write({
    runId,
    trialIndex,
    inputId,
    event: { type: 'llm.start', prompt, timestamp: startTime },
  });

  let firstChunkTime: number | null = null;
  const chunkTimestamps: number[] = [];
  let accumulated = '';
  let tokenCount = 0;

  try {
    const stream = await provider.generate(prompt);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LLM timeout')), timeoutMs),
    );

    const consume = async () => {
      for await (const chunk of stream) {
        const now = Date.now();
        if (firstChunkTime === null) firstChunkTime = now;
        chunkTimestamps.push(now);
        accumulated += chunk;
        tokenCount++;

        log.write({
          runId,
          trialIndex,
          inputId,
          event: { type: 'llm.chunk', chunk, accumulated, timestamp: now },
        });
      }
    };

    await Promise.race([consume(), timeout]);
  } catch (err) {
    const now = Date.now();
    log.write({
      runId,
      trialIndex,
      inputId,
      event: {
        type: 'llm.error',
        error: err instanceof Error ? err.message : String(err),
        recoverable: false,
        timestamp: now,
      },
    });
    return {
      ttft: 0,
      tgt: now - startTime,
      tps: 0,
      itl: 0,
      outputLength: accumulated.length,
      tokenCount,
      error: true,
    };
  }

  const endTime = Date.now();
  log.write({
    runId,
    trialIndex,
    inputId,
    event: { type: 'llm.complete', text: accumulated, tokensUsed: tokenCount, timestamp: endTime },
  });

  const tgt = endTime - startTime;
  const ttft = firstChunkTime !== null ? firstChunkTime - startTime : tgt;
  const tps = tgt > 0 ? (tokenCount / tgt) * 1000 : 0;

  // Inter-token latency: mean time between consecutive chunks
  let itl = 0;
  if (chunkTimestamps.length > 1) {
    const deltas: number[] = [];
    for (let i = 1; i < chunkTimestamps.length; i++) {
      deltas.push(chunkTimestamps[i] - chunkTimestamps[i - 1]);
    }
    itl = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  }

  return { ttft, tgt, tps, itl, outputLength: accumulated.length, tokenCount, error: false };
}

/**
 * Load prompts for the LLM benchmark.
 * TODO: Load from the standardized prompt set file.
 * For now, returns a minimal set for development.
 */
function loadPrompts(): Array<{ id: string; text: string }> {
  return [
    { id: 'conv-001', text: 'What is the capital of France?' },
    { id: 'conv-002', text: 'How does photosynthesis work?' },
    { id: 'conv-003', text: 'Tell me a short joke.' },
    { id: 'inst-001', text: 'Explain how to tie a bowline knot in simple steps.' },
    { id: 'inst-002', text: 'What are three benefits of regular exercise?' },
  ];
}

/**
 * Run the full LLM benchmark protocol.
 */
export async function runLLMBenchmark(
  config: RunnerConfig,
  log: RawLogWriter,
  runId: string,
): Promise<{ metrics: LLMMetrics; trialCount: number; errorCount: number }> {
  const provider = await createProvider(config);
  await provider.initialize();

  const prompts = loadPrompts();
  const runsPerPrompt = 3; // Section 5.3.4: 3 runs per prompt
  const totalTrials = prompts.length * runsPerPrompt;

  // Warm-up (Section 5.1.1)
  for (let i = 0; i < config.warmUpTrials; i++) {
    try {
      const stream = await provider.generate('Hello, how are you?');
      for await (const _ of stream) {
        /* drain */
      }
    } catch {
      /* ignore warm-up errors */
    }
    await sleep(config.cooldownMs);
  }

  // Run trials
  const results: LLMTrialResult[] = [];
  let trialIndex = 0;

  for (const prompt of prompts) {
    for (let run = 0; run < runsPerPrompt; run++) {
      const result = await runTrial(
        provider,
        prompt.text,
        trialIndex,
        `${prompt.id}_run${run}`,
        log,
        runId,
        config.timeoutMs,
      );
      results.push(result);
      trialIndex++;

      // Cooldown between trials (Section 5.1.2)
      if (trialIndex < totalTrials) {
        await sleep(config.cooldownMs);
      }
    }
  }

  // Dispose provider
  await provider.dispose();

  // Compute metrics
  const successful = results.filter((r) => !r.error);
  const errorCount = results.filter((r) => r.error).length;

  return {
    metrics: {
      ttft: computeSummary(successful.map((r) => r.ttft), 'ms'),
      tgt: computeSummary(successful.map((r) => r.tgt), 'ms'),
      tps: computeSummary(successful.map((r) => r.tps), 'tokens/s'),
      itl: computeSummary(successful.map((r) => r.itl), 'ms'),
      outputLength: computeSummary(successful.map((r) => r.outputLength), 'chars'),
      tokenCount: computeSummary(successful.map((r) => r.tokenCount), 'tokens'),
      errorRate: computeSummary([errorCount / results.length * 100], 'percent'),
    },
    trialCount: results.length,
    errorCount,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
