/**
 * Fly.io dispatch — sends test assignments to machines.
 *
 * Each machine receives a RunnerConfig via `fly ssh console` and
 * executes the benchmark CLI. Results are committed and pushed
 * to the shared branch by the machine itself.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import type {
  TestAssignment,
  OrchestratorConfig,
  RunnerConfig,
  AlignmentConfig,
  STTAlignmentConfig,
  LLMAlignmentConfig,
  TTSAlignmentConfig,
} from '../types/config.js';

// --- Feature alignment defaults (Section 3 of METHODOLOGY.md) ---

const STT_ALIGNMENT: STTAlignmentConfig = {
  language: 'en-US',
  interimResults: true,
  encoding: 'linear16',
  sampleRate: 16000,
  channels: 1,
  punctuation: false,
  profanityFilter: false,
  diarize: false,
  smartFormat: false,
  redact: [],
  keywords: [],
  vadEvents: false,
};

const LLM_ALIGNMENT: LLMAlignmentConfig = {
  stream: true,
  temperature: 0,
  topP: 1.0,
  maxTokens: 256,
  systemPrompt:
    'You are a helpful voice assistant. Respond concisely and conversationally. Keep responses under 3 sentences unless the question requires more detail.',
  stopSequences: [],
  frequencyPenalty: 0,
  presencePenalty: 0,
};

const TTS_ALIGNMENT: TTSAlignmentConfig = {
  encoding: 'linear16',
  sampleRate: 24000,
  channels: 1,
  rate: 1.0,
  pitch: 0,
  emotion: [],
  speed: 1.0,
};

function getAlignment(layer: string): AlignmentConfig {
  switch (layer) {
    case 'stt':
      return STT_ALIGNMENT;
    case 'llm':
      return LLM_ALIGNMENT;
    case 'tts':
      return TTS_ALIGNMENT;
    case 'full-stack':
      // Full-stack uses all three; the runner handles composition
      return LLM_ALIGNMENT;
    default:
      throw new Error(`Unknown layer: ${layer}`);
  }
}

/**
 * Resolve the API key for a provider from the orchestrator config.
 * For full-stack tests, returns the LLM provider's key (runner handles
 * resolving individual provider keys from environment variables).
 */
function resolveApiKey(assignment: TestAssignment, apiKeys: Record<string, string>): string {
  if (assignment.layer === 'full-stack' && assignment.providerTriple) {
    // For full-stack, the machine needs all three keys — pass via env vars
    return 'FULL_STACK';
  }
  return apiKeys[assignment.provider] || '';
}

/**
 * Build a RunnerConfig for a specific test assignment.
 */
export function buildRunnerConfig(
  assignment: TestAssignment,
  orchestratorConfig: OrchestratorConfig,
): RunnerConfig {
  const today = new Date().toISOString().split('T')[0];
  const branch =
    orchestratorConfig.branch ||
    `bench/${orchestratorConfig.dataset.name}-${orchestratorConfig.dataset.subset}/${today}`;

  return {
    assignment,
    dataset: orchestratorConfig.dataset,
    alignment: getAlignment(assignment.layer),
    apiKey: resolveApiKey(assignment, orchestratorConfig.apiKeys),
    providerConfig: {},
    branch,
    repoUrl: `https://github.com/${orchestratorConfig.repo}.git`,
    warmUpTrials: 3,
    cooldownMs: 2000,
    timeoutMs: assignment.layer === 'llm' ? 60_000 : 30_000,
  };
}

/**
 * Create the benchmark branch from the base branch.
 */
export function createBranch(branch: string, baseBranch: string): void {
  execSync(`git checkout ${baseBranch}`, { stdio: 'pipe' });
  execSync(`git checkout -b ${branch}`, { stdio: 'pipe' });
  execSync(`git push -u origin ${branch}`, { stdio: 'pipe' });
}

/**
 * Dispatch a single test to a Fly.io machine via `fly ssh console`.
 *
 * The RunnerConfig is passed as a base64-encoded JSON string to avoid
 * shell escaping issues. The machine decodes it and runs the benchmark.
 *
 * Returns a ChildProcess handle for monitoring.
 */
export function dispatchToMachine(
  runnerConfig: RunnerConfig,
  flyApp: string,
): ChildProcess {
  const configB64 = Buffer.from(JSON.stringify(runnerConfig)).toString('base64');
  const machine = runnerConfig.assignment.machine;

  const child = spawn(
    'fly',
    [
      'ssh',
      'console',
      '-a',
      flyApp,
      '-s',
      machine,
      '-C',
      `cd /app && node packages/benchmarking/dist/cli.js run --config-b64 ${configB64}`,
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return child;
}

/**
 * Dispatch all test assignments to their machines in parallel.
 *
 * Returns a promise that resolves when all machines have completed
 * (or failed). Results include exit codes and stdout/stderr per machine.
 */
export async function dispatchAll(
  assignments: TestAssignment[],
  orchestratorConfig: OrchestratorConfig,
): Promise<DispatchResult[]> {
  const promises = assignments.map((assignment) => {
    const config = buildRunnerConfig(assignment, orchestratorConfig);
    return dispatchOne(config, orchestratorConfig.flyApp);
  });

  return Promise.all(promises);
}

export interface DispatchResult {
  machine: string;
  assignment: TestAssignment;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function dispatchOne(config: RunnerConfig, flyApp: string): Promise<DispatchResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = dispatchToMachine(config, flyApp);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      resolve({
        machine: config.assignment.machine,
        assignment: config.assignment,
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        durationMs: Date.now() - start,
      });
    });

    child.on('error', (err) => {
      resolve({
        machine: config.assignment.machine,
        assignment: config.assignment,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - start,
      });
    });
  });
}
