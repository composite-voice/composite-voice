/**
 * Benchmark CLI — entry point for both orchestrator and runner modes.
 *
 * Usage:
 *   # Run as orchestrator (distributes tests to Fly.io machines)
 *   bench orchestrate --dataset librispeech --subset test-clean --tier fast
 *
 *   # Run as test runner on a machine (receives config from orchestrator)
 *   bench run --config-b64 <base64-encoded RunnerConfig>
 *
 *   # Plan a run (show assignments without executing)
 *   bench plan --layers stt,llm,tts --tier fast
 */

import { parseArgs } from 'node:util';
import type { RunnerConfig, Layer, Tier } from './types/config.js';
import { planRun } from './orchestrator/assignment.js';
import { MACHINE_POOL } from './orchestrator/machines.js';
import { run } from './runner/index.js';

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'config-b64': { type: 'string' },
      dataset: { type: 'string' },
      subset: { type: 'string' },
      layers: { type: 'string' },
      tier: { type: 'string' },
      layer: { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
    },
  });

  const command = positionals[0];

  switch (command) {
    case 'run':
      await handleRun(values);
      break;
    case 'plan':
      handlePlan(values);
      break;
    case 'orchestrate':
      await handleOrchestrate(values);
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

/**
 * Handle the `run` command — executed on a Fly.io machine.
 */
async function handleRun(values: Record<string, string | undefined>) {
  const configB64 = values['config-b64'];
  if (!configB64) {
    console.error('Error: --config-b64 is required for `run` command');
    process.exit(1);
  }

  const config: RunnerConfig = JSON.parse(
    Buffer.from(configB64, 'base64').toString('utf-8'),
  );

  await run(config);
}

/**
 * Handle the `plan` command — show test assignments without executing.
 */
function handlePlan(values: Record<string, string | undefined>) {
  const layers = (values.layers || 'stt,llm,tts').split(',') as Layer[];
  const tier = (values.tier || 'fast') as Tier;

  const assignments = planRun(layers, tier);

  console.log(`\nBenchmark Plan: ${layers.join(', ')} @ ${tier} tier`);
  console.log(`Machines: ${MACHINE_POOL.join(', ')}`);
  console.log(`Total tests: ${assignments.length}\n`);

  // Group by machine
  const byMachine = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byMachine.get(a.machine) || [];
    list.push(a);
    byMachine.set(a.machine, list);
  }

  for (const [machine, tests] of byMachine) {
    console.log(`  ${machine}:`);
    for (const t of tests) {
      console.log(`    ${t.layer}/${t.provider}/${t.model}`);
    }
  }

  // Show machines with no assignments
  for (const machine of MACHINE_POOL) {
    if (!byMachine.has(machine)) {
      console.log(`  ${machine}: (idle)`);
    }
  }

  console.log('');
}

/**
 * Handle the `orchestrate` command — distribute and execute tests.
 */
async function handleOrchestrate(values: Record<string, string | undefined>) {
  const layers = (values.layers || values.layer || 'stt,llm,tts').split(',') as Layer[];
  const tier = (values.tier || 'fast') as Tier;
  const dataset = values.dataset;
  const subset = values.subset;

  if (!dataset || !subset) {
    console.error('Error: --dataset and --subset are required for `orchestrate` command');
    process.exit(1);
  }

  const assignments = planRun(layers, tier);
  const today = new Date().toISOString().split('T')[0];
  const branch = `bench/${dataset}-${subset}/${today}`;

  console.log(`\nOrchestrating benchmark run:`);
  console.log(`  Dataset: ${dataset}-${subset}`);
  console.log(`  Layers: ${layers.join(', ')}`);
  console.log(`  Tier: ${tier}`);
  console.log(`  Branch: ${branch}`);
  console.log(`  Tests: ${assignments.length}`);
  console.log(`  Machines: ${new Set(assignments.map((a) => a.machine)).size} of ${MACHINE_POOL.length}`);
  console.log('');

  // TODO: Create branch, dispatch to Fly.io machines, wait, open PR
  console.log('Dispatch not yet implemented. Run `bench plan` to preview assignments.');
}

function printUsage() {
  console.log(`
Usage: bench <command> [options]

Commands:
  plan          Show test assignments without executing
  orchestrate   Distribute and execute tests on Fly.io machines
  run           Execute a test (called by orchestrator on each machine)

Options:
  --dataset     Dataset name (e.g., librispeech)
  --subset      Dataset subset (e.g., test-clean)
  --layers      Comma-separated layers (stt,llm,tts,full-stack)
  --tier        Model tier (fast, balanced, quality)
  --config-b64  Base64-encoded RunnerConfig (for 'run' command)
`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
