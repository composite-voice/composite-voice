/**
 * Result file writer — Section 8.2-8.3 of METHODOLOGY.md
 *
 * Writes the result JSON to the correct path in the repository,
 * commits it to the benchmark branch, and pushes. Handles the
 * rebase-retry conflict resolution strategy (Section 11.5).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ResultFile } from '../types/schema.js';
import type { TestAssignment } from '../types/config.js';

const MAX_PUSH_RETRIES = 5;

/**
 * Build the deterministic file path for a result file.
 *
 * Format: data/runs/{dataset}-{subset}/{YYYY-MM-DD}/{layer}-{provider}-{model}.json
 *
 * Dots in model names are replaced with hyphens for filesystem safety.
 */
export function buildResultPath(assignment: TestAssignment, dataset: string, subset: string): string {
  const today = new Date().toISOString().split('T')[0];
  const safeModel = assignment.model.replace(/\./g, '-');
  const fileName = `${assignment.layer}-${assignment.provider}-${safeModel}.json`;

  return path.join('packages', 'benchmarking', 'data', 'runs', `${dataset}-${subset}`, today, fileName);
}

/**
 * Write a result file to disk.
 */
export function writeResult(resultPath: string, result: ResultFile): void {
  const dir = path.dirname(resultPath);
  fs.mkdirSync(dir, { recursive: true });

  // Write with sorted keys for stable, diffable JSON
  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(resultPath, json + '\n', 'utf-8');
}

/**
 * Build the conventional commit message for this test.
 *
 * Format: bench({layer}): {provider} {model} against {dataset}-{subset}
 */
function buildCommitMessage(assignment: TestAssignment, dataset: string, subset: string): string {
  return `bench(${assignment.layer}): ${assignment.provider} ${assignment.model} against ${dataset}-${subset}`;
}

/**
 * Commit the result file and push to the branch.
 *
 * Uses the rebase-retry strategy from Section 11.5 of METHODOLOGY.md:
 * if push fails due to concurrent pushes from other machines, pull --rebase
 * and retry up to 5 times. File name determinism guarantees no conflicts
 * during rebase.
 */
export function commitAndPush(
  resultPath: string,
  assignment: TestAssignment,
  dataset: string,
  subset: string,
): void {
  const message = buildCommitMessage(assignment, dataset, subset);

  // Stage the result file
  execSync(`git add ${resultPath}`, { stdio: 'pipe' });

  // Commit
  execSync(`git commit -m "${message}"`, { stdio: 'pipe' });

  // Push with rebase-retry
  for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt++) {
    try {
      execSync('git push', { stdio: 'pipe' });
      return; // Success
    } catch {
      if (attempt === MAX_PUSH_RETRIES) {
        throw new Error(
          `Failed to push after ${MAX_PUSH_RETRIES} attempts. ` +
            `Result saved locally at: ${resultPath}`,
        );
      }
      // Rebase and retry
      execSync('git pull --rebase', { stdio: 'pipe' });
    }
  }
}
