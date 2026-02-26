/**
 * Result file schema types — Section 9 of METHODOLOGY.md
 *
 * Each result file is self-contained: one provider, one layer, one dataset.
 * The schema version field allows tooling to handle format evolution.
 */

export const SCHEMA_VERSION = 1;

export type Layer = 'stt' | 'llm' | 'tts' | 'full-stack';
export type Tier = 'fast' | 'balanced' | 'quality';

// --- Statistical summary for a single metric ---

export interface OutlierInfo {
  count: number;
  method: '3x IQR';
  indices: number[];
  values: number[];
}

export interface MetricSummary {
  unit: string;
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stdDev: number;
  cv: number;
  sampleSize: number;
  outliers: OutlierInfo;
}

// --- Layer-specific metric sets ---

export interface STTMetrics {
  ttfp: MetricSummary;
  ttft: MetricSummary;
  transcriptionLatency: MetricSummary;
  wer: MetricSummary;
  confidence: MetricSummary;
  errorRate: MetricSummary;
}

export interface LLMMetrics {
  ttft: MetricSummary;
  tgt: MetricSummary;
  tps: MetricSummary;
  itl: MetricSummary;
  outputLength: MetricSummary;
  tokenCount: MetricSummary;
  errorRate: MetricSummary;
}

export interface TTSMetrics {
  ttfa: MetricSummary;
  tst: MetricSummary;
  audioChunkCount: MetricSummary;
  audioDataVolume: MetricSummary;
  synthesisThroughput: MetricSummary;
  icl: MetricSummary;
  errorRate: MetricSummary;
}

export interface FullStackMetrics {
  e2e: MetricSummary;
  prt: MetricSummary;
  sttSegment: MetricSummary;
  handoffSttToLlm: MetricSummary;
  llmSegment: MetricSummary;
  handoffLlmToTts: MetricSummary;
  ttsSegment: MetricSummary;
  pipelineOverhead: MetricSummary;
  errorRate: MetricSummary;
}

export type LayerMetrics = STTMetrics | LLMMetrics | TTSMetrics | FullStackMetrics;

// --- Environment recording ---

export interface HardwareInfo {
  cpu: string;
  ram: string;
  gpu: string | null;
  network: string;
  disk: string;
}

export interface SoftwareInfo {
  os: string;
  nodeVersion: string;
  sdkVersion: string;
  sdkCommit: string;
  pnpmVersion: string;
}

export interface PingInfo {
  host: string;
  meanMs: number;
  stdDevMs: number;
}

export interface NetworkInfo {
  isp: string;
  geography: string;
  pingToProvider: PingInfo;
  bandwidthDown: string;
  bandwidthUp: string;
}

export interface ProviderVersionInfo {
  apiVersion: string;
  sdkPackage: string;
}

export interface EnvironmentInfo {
  hardware: HardwareInfo;
  software: SoftwareInfo;
  network: NetworkInfo;
  providerVersions: ProviderVersionInfo;
}

// --- Summary ---

export interface RunSummary {
  trialCount: number;
  errorCount: number;
  errorRate: number;
  warmUpTrials: number;
  cooldownMs: number;
  timeoutMs: number;
  totalDurationMs: number;
}

// --- Raw log provenance ---

export interface RawLogInfo {
  hash: string;
  byteSize: number;
  eventCount: number;
  storagePath: string | null;
}

// --- Dataset manifest ---

export interface DatasetManifest {
  name: string;
  subset: string;
  version: string;
  sourceUrl: string;
  archiveHash: string;
  sampleCount: number;
  totalDurationSec: number | null;
}

// --- Full-stack provider detail ---

export interface ProviderTriple {
  stt: { provider: string; model: string };
  llm: { provider: string; model: string };
  tts: { provider: string; model: string };
}

// --- The result file ---

export interface ResultFile {
  schema: typeof SCHEMA_VERSION;
  testId: string;
  timestamp: string;

  dataset: string;
  subset: string;
  layer: Layer;
  provider: string;
  model: string;
  tier: Tier;
  providerDetail?: ProviderTriple;

  config: Record<string, unknown>;
  environment: EnvironmentInfo;
  summary: RunSummary;
  metrics: LayerMetrics;
  rawLog: RawLogInfo;
  datasetManifest: DatasetManifest;
}
