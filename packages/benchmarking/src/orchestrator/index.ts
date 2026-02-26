/**
 * Benchmark orchestrator — Section 8 of METHODOLOGY.md
 *
 * Coordinates a full benchmark run:
 * 1. Plans which tests to run at which tier
 * 2. Randomly assigns tests to Fly.io machines
 * 3. Creates the benchmark branch
 * 4. Dispatches all tests in parallel
 * 5. Waits for completion
 * 6. Opens a PR with the results
 */

export { MACHINE_POOL, MACHINE_COUNT, type MachineName } from './machines.js';
export { buildTestList, assignMachines, planRun } from './assignment.js';
export {
  buildRunnerConfig,
  createBranch,
  dispatchToMachine,
  dispatchAll,
  type DispatchResult,
} from './dispatch.js';
