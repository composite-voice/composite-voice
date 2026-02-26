/**
 * Fly.io machine pool — Section 8.1 of METHODOLOGY.md
 *
 * 10 pre-deployed, pre-named machines. The orchestrator distributes
 * test assignments randomly across these machines to avoid systematic
 * bias (e.g., provider X always running on machine Y).
 */

export const MACHINE_POOL = [
  'benchmark-01',
  'benchmark-02',
  'benchmark-03',
  'benchmark-04',
  'benchmark-05',
  'benchmark-06',
  'benchmark-07',
  'benchmark-08',
  'benchmark-09',
  'benchmark-10',
] as const;

export type MachineName = (typeof MACHINE_POOL)[number];

export const MACHINE_COUNT = MACHINE_POOL.length;
