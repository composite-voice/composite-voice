/**
 * Test-to-machine assignment with randomization.
 *
 * The orchestrator assigns each test to a machine using a Fisher-Yates
 * shuffle of the machine pool. This ensures that over multiple runs,
 * no machine is systematically paired with a specific provider — the
 * data shouldn't show a trend of X provider going to Y machine.
 *
 * When there are more tests than machines (common case), machines are
 * reused in round-robin after the shuffled pool is exhausted. The
 * shuffle is re-applied each time the pool wraps to maintain randomness.
 */

import { randomUUID } from 'node:crypto';
import { MACHINE_POOL, type MachineName } from './machines.js';
import type {
  TestAssignment,
  Layer,
  Tier,
  STTProviderName,
  LLMProviderName,
  TTSProviderName,
  ModelMapping,
} from '../types/config.js';

// --- Model tier mappings (Section 3 of METHODOLOGY.md) ---

const STT_MODELS: ModelMapping[] = [
  { provider: 'deepgram', model: 'nova-3', tier: 'fast', layer: 'stt' },
  { provider: 'assemblyai', model: 'default', tier: 'fast', layer: 'stt' },
  { provider: 'deepgram', model: 'nova-2', tier: 'quality', layer: 'stt' },
];

const LLM_MODELS: ModelMapping[] = [
  { provider: 'anthropic', model: 'claude-haiku-4-5', tier: 'fast', layer: 'llm' },
  { provider: 'openai', model: 'gpt-4o-mini', tier: 'fast', layer: 'llm' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', tier: 'fast', layer: 'llm' },
  { provider: 'mistral', model: 'mistral-small-latest', tier: 'fast', layer: 'llm' },
  { provider: 'gemini', model: 'gemini-2.0-flash', tier: 'fast', layer: 'llm' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', tier: 'balanced', layer: 'llm' },
  { provider: 'openai', model: 'gpt-4o', tier: 'balanced', layer: 'llm' },
  { provider: 'mistral', model: 'mistral-medium-latest', tier: 'balanced', layer: 'llm' },
  { provider: 'gemini', model: 'gemini-1.5-pro', tier: 'balanced', layer: 'llm' },
  { provider: 'anthropic', model: 'claude-opus-4-6', tier: 'quality', layer: 'llm' },
  { provider: 'openai', model: 'gpt-4', tier: 'quality', layer: 'llm' },
  { provider: 'mistral', model: 'mistral-large-latest', tier: 'quality', layer: 'llm' },
];

const TTS_MODELS: ModelMapping[] = [
  { provider: 'deepgram', model: 'aura-2-thalia-en', tier: 'fast', layer: 'tts' },
  { provider: 'openai', model: 'tts-1', tier: 'fast', layer: 'tts' },
  { provider: 'elevenlabs', model: 'eleven_turbo_v2_5', tier: 'fast', layer: 'tts' },
  { provider: 'cartesia', model: 'sonic-2', tier: 'fast', layer: 'tts' },
  { provider: 'openai', model: 'tts-1-hd', tier: 'quality', layer: 'tts' },
  { provider: 'elevenlabs', model: 'eleven_multilingual_v2', tier: 'quality', layer: 'tts' },
];

/**
 * Fisher-Yates shuffle (in-place, mutates array).
 * Cryptographically random via crypto.getRandomValues.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    // Use crypto for unbiased randomness
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const j = randomBytes[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Get all model mappings for a given layer and tier.
 */
function getModelsForLayer(layer: Layer, tier: Tier): ModelMapping[] {
  switch (layer) {
    case 'stt':
      return STT_MODELS.filter((m) => m.tier === tier);
    case 'llm':
      return LLM_MODELS.filter((m) => m.tier === tier);
    case 'tts':
      return TTS_MODELS.filter((m) => m.tier === tier);
    case 'full-stack':
      return []; // Handled separately
  }
}

/**
 * Generate full-stack test assignments for all provider triples at a tier.
 */
function getFullStackTriples(tier: Tier): TestAssignment[] {
  const sttModels = STT_MODELS.filter((m) => m.tier === tier);
  const llmModels = LLM_MODELS.filter((m) => m.tier === tier);
  const ttsModels = TTS_MODELS.filter((m) => m.tier === tier);

  const assignments: TestAssignment[] = [];

  for (const stt of sttModels) {
    for (const llm of llmModels) {
      for (const tts of ttsModels) {
        assignments.push({
          id: randomUUID(),
          machine: '', // Assigned later
          layer: 'full-stack',
          provider: `${stt.provider}-${llm.provider}-${tts.provider}`,
          model: `${stt.model}_${llm.model}_${tts.model}`,
          tier,
          providerTriple: {
            stt: { provider: stt.provider as STTProviderName, model: stt.model },
            llm: { provider: llm.provider as LLMProviderName, model: llm.model },
            tts: { provider: tts.provider as TTSProviderName, model: tts.model },
          },
        });
      }
    }
  }

  return assignments;
}

/**
 * Build a list of all test assignments for the requested layers and tier.
 * Machines are NOT yet assigned — call assignMachines() after.
 */
export function buildTestList(layers: Layer[], tier: Tier): TestAssignment[] {
  const tests: TestAssignment[] = [];

  for (const layer of layers) {
    if (layer === 'full-stack') {
      tests.push(...getFullStackTriples(tier));
    } else {
      for (const mapping of getModelsForLayer(layer, tier)) {
        tests.push({
          id: randomUUID(),
          machine: '',
          layer: mapping.layer as Layer,
          provider: mapping.provider,
          model: mapping.model,
          tier: mapping.tier as Tier,
        });
      }
    }
  }

  return tests;
}

/**
 * Assign machines to tests using shuffled round-robin.
 *
 * The machine pool is shuffled, then tests are assigned in order.
 * When we exhaust the pool, we reshuffle and continue. This means:
 *
 * - With 10 machines and 11 tests, the 11th test gets a random machine
 *   from a freshly shuffled pool (not necessarily machine #1 again).
 * - Over multiple runs on different dates, the same test will land on
 *   different machines due to the random shuffle.
 * - No machine is systematically favored or avoided for any provider.
 *
 * Mutates the assignments in-place (sets the `machine` field).
 */
export function assignMachines(assignments: TestAssignment[]): TestAssignment[] {
  let pool: MachineName[] = [];

  for (const assignment of assignments) {
    if (pool.length === 0) {
      pool = shuffle([...MACHINE_POOL]);
    }
    assignment.machine = pool.pop()!;
  }

  // Shuffle the assignment order itself so that machine assignment
  // doesn't correlate with layer/provider ordering
  shuffle(assignments);

  return assignments;
}

/**
 * Build and assign: convenience function that builds the test list
 * and assigns machines in one call.
 */
export function planRun(layers: Layer[], tier: Tier): TestAssignment[] {
  const tests = buildTestList(layers, tier);
  return assignMachines(tests);
}
