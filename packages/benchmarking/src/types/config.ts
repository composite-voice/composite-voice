/**
 * Benchmark configuration types.
 *
 * These types define the parameters for a benchmark run, from the
 * high-level orchestrator config down to individual test assignments.
 */

import type { Layer, Tier } from './schema.js';

// --- Provider registry ---

export type STTProviderName = 'deepgram' | 'assemblyai';
export type LLMProviderName = 'anthropic' | 'openai' | 'groq' | 'mistral' | 'gemini';
export type TTSProviderName = 'deepgram' | 'openai' | 'elevenlabs' | 'cartesia';
export type ProviderName = STTProviderName | LLMProviderName | TTSProviderName;

// --- Model mappings per tier ---

export interface ModelMapping {
  provider: ProviderName;
  model: string;
  tier: Tier;
  layer: Layer;
}

// --- Test assignment ---

export interface TestAssignment {
  /** Unique ID for this test (used for logging and tracking) */
  id: string;
  /** Machine to run on (e.g., 'benchmark-07') */
  machine: string;
  /** Layer being tested */
  layer: Layer;
  /** Provider being tested */
  provider: ProviderName;
  /** Model identifier */
  model: string;
  /** Tier for this test */
  tier: Tier;
  /** For full-stack tests, the provider triple */
  providerTriple?: {
    stt: { provider: STTProviderName; model: string };
    llm: { provider: LLMProviderName; model: string };
    tts: { provider: TTSProviderName; model: string };
  };
}

// --- Dataset configuration ---

export interface DatasetConfig {
  /** Dataset name (e.g., 'librispeech') */
  name: string;
  /** Subset name (e.g., 'test-clean') */
  subset: string;
  /** Path to the dataset on disk (resolved at runtime) */
  path: string;
  /** SHA-256 hash of the dataset archive */
  archiveHash: string;
  /** Source URL for the dataset */
  sourceUrl: string;
  /** Dataset version */
  version: string;
}

// --- Feature alignment configs per layer (Section 3 of METHODOLOGY.md) ---

export interface STTAlignmentConfig {
  language: string;
  interimResults: boolean;
  encoding: string;
  sampleRate: number;
  channels: number;
  punctuation: boolean;
  profanityFilter: boolean;
  diarize: boolean;
  smartFormat: boolean;
  redact: string[];
  keywords: string[];
  vadEvents: boolean;
}

export interface LLMAlignmentConfig {
  stream: boolean;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string;
  stopSequences: string[];
  frequencyPenalty: number;
  presencePenalty: number;
}

export interface TTSAlignmentConfig {
  encoding: string;
  sampleRate: number;
  channels: number;
  rate: number;
  pitch: number;
  emotion: string[];
  speed: number;
}

export interface FullStackAlignmentConfig {
  stt: STTAlignmentConfig;
  llm: LLMAlignmentConfig;
  tts: TTSAlignmentConfig;
}

export type AlignmentConfig =
  | STTAlignmentConfig
  | LLMAlignmentConfig
  | TTSAlignmentConfig
  | FullStackAlignmentConfig;

// --- Orchestrator config ---

export interface OrchestratorConfig {
  /** Dataset configuration */
  dataset: DatasetConfig;
  /** Which layers to benchmark */
  layers: Layer[];
  /** Which tier to test */
  tier: Tier;
  /** Provider API keys (provider name -> key) */
  apiKeys: Record<string, string>;
  /** Git branch name (auto-generated if not provided) */
  branch?: string;
  /** Base branch to create from */
  baseBranch: string;
  /** GitHub repo for PR creation (e.g., 'lukeocodes/composite-voice') */
  repo: string;
  /** Fly.io app name */
  flyApp: string;
}

// --- Runner config (what each machine receives) ---

export interface RunnerConfig {
  /** The test assignment for this machine */
  assignment: TestAssignment;
  /** Dataset configuration */
  dataset: DatasetConfig;
  /** Feature alignment configuration for the layer */
  alignment: AlignmentConfig;
  /** Provider API key */
  apiKey: string;
  /** Additional provider-specific config (e.g., voiceId for TTS) */
  providerConfig: Record<string, unknown>;
  /** API keys for full-stack tests (provider name -> key) */
  apiKeys?: Record<string, string>;
  /** Git branch to commit results to */
  branch: string;
  /** Git repo URL */
  repoUrl: string;
  /** Number of warm-up trials */
  warmUpTrials: number;
  /** Cooldown between trials in ms */
  cooldownMs: number;
  /** Timeout per trial in ms */
  timeoutMs: number;
}
