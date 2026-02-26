/**
 * @lukeocodes/composite-voice-benchmarking
 *
 * Measurable, proveable, and repeatable benchmarking for CompositeVoice
 * STT, LLM, and TTS providers — independently and as a composite pipeline.
 *
 * See METHODOLOGY.md for the full benchmarking methodology.
 */

// Types
export type {
  ResultFile,
  MetricSummary,
  OutlierInfo,
  Layer,
  Tier,
  STTMetrics,
  LLMMetrics,
  TTSMetrics,
  FullStackMetrics,
  LayerMetrics,
  EnvironmentInfo,
  RunSummary,
  RawLogInfo,
  DatasetManifest,
  ProviderTriple,
} from './types/schema.js';

export type {
  TestAssignment,
  RunnerConfig,
  OrchestratorConfig,
  DatasetConfig,
  ModelMapping,
  STTAlignmentConfig,
  LLMAlignmentConfig,
  TTSAlignmentConfig,
} from './types/config.js';

// Stats
export { computeSummary } from './stats/summary.js';
export { computeWER, normalizeForWER } from './stats/wer.js';

// Environment
export { collectEnvironment, pingHost } from './environment/collector.js';

// Orchestrator
export { planRun, buildTestList, assignMachines } from './orchestrator/assignment.js';
export { MACHINE_POOL, MACHINE_COUNT } from './orchestrator/machines.js';

// Results
export { buildResultPath, writeResult, commitAndPush } from './results/writer.js';
export { RawLogWriter } from './results/raw-log.js';

// Runner
export { run } from './runner/index.js';
