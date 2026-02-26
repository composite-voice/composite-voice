/**
 * Benchmark runner — the main entry point executed on each Fly.io machine.
 *
 * Receives a RunnerConfig (via CLI), executes the appropriate benchmark
 * protocol, collects environment metadata, writes the result file, and
 * commits + pushes to the benchmark branch.
 */

import { randomUUID } from 'node:crypto';
import type { RunnerConfig } from '../types/config.js';
import type { ResultFile, LayerMetrics } from '../types/schema.js';
import { SCHEMA_VERSION } from '../types/schema.js';
import { collectEnvironment } from '../environment/collector.js';
import { RawLogWriter } from '../results/raw-log.js';
import { buildResultPath, writeResult, commitAndPush } from '../results/writer.js';
import { runSTTBenchmark } from './stt-bench.js';
import { runLLMBenchmark } from './llm-bench.js';
import { runTTSBenchmark } from './tts-bench.js';

/**
 * Execute a benchmark run on this machine.
 *
 * This is the function called by the CLI when a machine receives
 * its test assignment from the orchestrator.
 */
export async function run(config: RunnerConfig): Promise<ResultFile> {
  const runId = randomUUID();
  const testId = config.assignment.id;
  const startTime = new Date().toISOString();

  console.log(`[bench] Starting: ${config.assignment.layer}/${config.assignment.provider}/${config.assignment.model}`);
  console.log(`[bench] Machine: ${config.assignment.machine}`);
  console.log(`[bench] Dataset: ${config.dataset.name}-${config.dataset.subset}`);
  console.log(`[bench] Run ID: ${runId}`);

  // Collect environment metadata
  const environment = collectEnvironment(config.assignment.provider);

  // Initialize raw event log
  const log = new RawLogWriter(runId, testId);

  // Run the benchmark for the assigned layer
  const benchStart = Date.now();
  let metrics: LayerMetrics;
  let trialCount: number;
  let errorCount: number;

  switch (config.assignment.layer) {
    case 'stt': {
      const result = await runSTTBenchmark(config, log, runId);
      metrics = result.metrics;
      trialCount = result.trialCount;
      errorCount = result.errorCount;
      break;
    }
    case 'llm': {
      const result = await runLLMBenchmark(config, log, runId);
      metrics = result.metrics;
      trialCount = result.trialCount;
      errorCount = result.errorCount;
      break;
    }
    case 'tts': {
      const result = await runTTSBenchmark(config, log, runId);
      metrics = result.metrics;
      trialCount = result.trialCount;
      errorCount = result.errorCount;
      break;
    }
    case 'full-stack': {
      // TODO: Implement full-stack benchmark
      throw new Error('Full-stack benchmark not yet implemented');
    }
    default:
      throw new Error(`Unknown layer: ${config.assignment.layer}`);
  }

  const totalDurationMs = Date.now() - benchStart;

  // Finalize raw log and get provenance hash
  const rawLog = log.finalize();

  // Build the result file
  const result: ResultFile = {
    schema: SCHEMA_VERSION,
    testId,
    timestamp: startTime,

    dataset: config.dataset.name,
    subset: config.dataset.subset,
    layer: config.assignment.layer,
    provider: config.assignment.provider,
    model: config.assignment.model,
    tier: config.assignment.tier,
    providerDetail: config.assignment.providerTriple
      ? {
          stt: config.assignment.providerTriple.stt,
          llm: config.assignment.providerTriple.llm,
          tts: config.assignment.providerTriple.tts,
        }
      : undefined,

    config: config.alignment as Record<string, unknown>,
    environment,
    summary: {
      trialCount,
      errorCount,
      errorRate: trialCount > 0 ? errorCount / trialCount : 0,
      warmUpTrials: config.warmUpTrials,
      cooldownMs: config.cooldownMs,
      timeoutMs: config.timeoutMs,
      totalDurationMs,
    },
    metrics,
    rawLog,
    datasetManifest: {
      name: config.dataset.name,
      subset: config.dataset.subset,
      version: config.dataset.version,
      sourceUrl: config.dataset.sourceUrl,
      archiveHash: config.dataset.archiveHash,
      sampleCount: trialCount,
      totalDurationSec: null,
    },
  };

  // Write result file
  const resultPath = buildResultPath(
    config.assignment,
    config.dataset.name,
    config.dataset.subset,
  );

  writeResult(resultPath, result);
  console.log(`[bench] Result written: ${resultPath}`);

  // Commit and push
  try {
    commitAndPush(resultPath, config.assignment, config.dataset.name, config.dataset.subset);
    console.log(`[bench] Committed and pushed to ${config.branch}`);
  } catch (err) {
    console.error(`[bench] Failed to push: ${err instanceof Error ? err.message : err}`);
    console.log(`[bench] Result saved locally at: ${resultPath}`);
  }

  // Flag if error rate exceeds 10% threshold (Section 5.1.3)
  if (trialCount > 0 && errorCount / trialCount > 0.1) {
    console.warn(`[bench] WARNING: Error rate ${((errorCount / trialCount) * 100).toFixed(1)}% exceeds 10% threshold`);
  }

  console.log(`[bench] Complete: ${trialCount} trials, ${errorCount} errors, ${totalDurationMs}ms`);

  return result;
}
