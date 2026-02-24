/**
 * Shared Playwright E2E test utilities for composite-voice examples.
 *
 * Provides browser launch helpers (with fake audio capture), dev server
 * management, console/network diagnostics, retry logic with escalating
 * timeouts, and GitHub Issue creation for flaky-test triage.
 */

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { type ChildProcess, spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as net from 'node:net';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute path to the fake audio fixture used by Chromium's audio capture */
const FIXTURE_WAV = path.resolve(__dirname, '../fixtures/spacewalk.wav');

/** Escalating timeout tiers (ms) for the retry wrapper */
const TIMEOUT_TIERS = [60_000, 90_000, 120_000] as const;

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

/**
 * Launch Chromium configured for headless voice-agent testing.
 *
 * Key flags:
 * - `--use-fake-device-for-media-stream` tells Chromium to use a synthetic
 *   device instead of real hardware for getUserMedia.
 * - `--use-fake-ui-for-media-stream` auto-grants microphone permissions.
 * - `--use-file-for-fake-audio-capture` feeds the spacewalk.wav fixture as
 *   the microphone input so the STT pipeline receives real audio data.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-audio-capture=${FIXTURE_WAV}`,
    ],
  });
}

/**
 * Create a browser context with microphone permissions pre-granted.
 * Useful when pages check `navigator.permissions.query()` before calling
 * `getUserMedia`.
 */
export async function createContext(
  browser: Browser,
  options: { baseURL?: string } = {},
): Promise<BrowserContext> {
  return browser.newContext({
    permissions: ['microphone'],
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });
}

// ---------------------------------------------------------------------------
// Dev-server management
// ---------------------------------------------------------------------------

export interface DevServer {
  /** The child process running the dev server */
  process: ChildProcess;
  /** The URL where the dev server is listening */
  url: string;
  /** Kill the dev server and wait for the process to exit */
  stop: () => Promise<void>;
}

/**
 * Start an example's Vite dev server and wait until it is accepting
 * connections on the given port.
 *
 * @param exampleDir - Absolute path to the example directory
 * @param port       - Port the server should listen on
 * @param timeoutMs  - Maximum time (ms) to wait for the server to be ready
 */
export async function startDevServer(
  exampleDir: string,
  port: number,
  timeoutMs = 30_000,
): Promise<DevServer> {
  const child = spawn('pnpm', ['dev', '--port', String(port)], {
    cwd: exampleDir,
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' },
  });

  // Collect stderr for diagnostics if the server fails to start
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  await waitForPort(port, timeoutMs).catch((err) => {
    child.kill('SIGTERM');
    throw new Error(
      `Dev server in ${exampleDir} did not start on port ${port} within ${timeoutMs}ms.\nStderr: ${stderr}\n${String(err)}`,
    );
  });

  const url = `http://localhost:${port}`;

  return {
    process: child,
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.killed || child.exitCode !== null) {
          resolve();
          return;
        }
        child.on('exit', () => resolve());
        child.kill('SIGTERM');
      }),
  };
}

/**
 * Poll until a TCP connection can be established on `port`.
 */
function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Port ${port} not reachable after ${timeoutMs}ms`));
        return;
      }
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

// ---------------------------------------------------------------------------
// Console & network diagnostics
// ---------------------------------------------------------------------------

export interface PageDiagnostics {
  /** Console messages collected from the page (level + text) */
  consoleLogs: Array<{ level: string; text: string }>;
  /** Console error messages only */
  consoleErrors: Array<{ level: string; text: string }>;
  /** Failed network requests (non-2xx or aborted) */
  networkFailures: Array<{ url: string; status: number; statusText: string }>;
}

/**
 * Attach listeners to a Playwright Page that collect console output and
 * network failures. Call this immediately after creating the page and
 * before navigating.
 *
 * @returns An object whose arrays are populated in real-time as events fire.
 */
export function collectDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = {
    consoleLogs: [],
    consoleErrors: [],
    networkFailures: [],
  };

  page.on('console', (msg) => {
    const entry = { level: msg.type(), text: msg.text() };
    diagnostics.consoleLogs.push(entry);
    if (msg.type() === 'error') {
      diagnostics.consoleErrors.push(entry);
    }
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      diagnostics.networkFailures.push({
        url: response.url(),
        status,
        statusText: response.statusText(),
      });
    }
  });

  page.on('requestfailed', (request) => {
    diagnostics.networkFailures.push({
      url: request.url(),
      status: 0,
      statusText: request.failure()?.errorText ?? 'unknown',
    });
  });

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Retry wrapper with escalating timeouts
// ---------------------------------------------------------------------------

/**
 * Execute `fn` up to three times with escalating timeouts (60s → 90s → 120s).
 *
 * Each attempt races the function against a timeout. If the function throws
 * or the timeout fires, the next tier is attempted. After all tiers are
 * exhausted the last error is re-thrown.
 *
 * @param fn    - The async function to execute. Receives the attempt index (0-based)
 *                and the timeout in ms for the current tier.
 * @param label - A human-readable label used in error messages.
 */
export async function withRetry<T>(
  fn: (attempt: number, timeoutMs: number) => Promise<T>,
  label: string,
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < TIMEOUT_TIERS.length; i++) {
    const tier = TIMEOUT_TIERS[i]!;
    try {
      const result = await Promise.race([
        fn(i, tier),
        rejectAfter(tier, `${label} timed out after ${tier}ms (attempt ${i + 1}/${TIMEOUT_TIERS.length})`),
      ]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Continue to next tier
    }
  }

  throw lastError ?? new Error(`${label} failed after all retry tiers`);
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

// ---------------------------------------------------------------------------
// GitHub Issue creation (for CI flaky-test triage)
// ---------------------------------------------------------------------------

export interface IssueData {
  /** Short title for the issue */
  title: string;
  /** Which example was being tested */
  example: string;
  /** Which retry tier failed */
  attempt: number;
  /** Error message / stack */
  error: string;
  /** Collected diagnostics from the page */
  diagnostics?: PageDiagnostics;
  /** Additional key-value labels */
  labels?: string[];
}

/**
 * Create a GitHub Issue with structured diagnostic data using `gh issue create`.
 *
 * Requires the `gh` CLI to be installed and authenticated. If `gh` is not
 * available (e.g. local dev), this logs a warning and returns `undefined`.
 */
export function createGitHubIssue(data: IssueData): string | undefined {
  const body = [
    `## E2E Test Failure`,
    '',
    `**Example:** \`${data.example}\``,
    `**Attempt:** ${data.attempt + 1}/${TIMEOUT_TIERS.length}`,
    '',
    '### Error',
    '```',
    data.error,
    '```',
  ];

  if (data.diagnostics) {
    if (data.diagnostics.consoleErrors.length > 0) {
      body.push('', '### Console Errors', '```');
      for (const e of data.diagnostics.consoleErrors.slice(0, 20)) {
        body.push(`[${e.level}] ${e.text}`);
      }
      body.push('```');
    }

    if (data.diagnostics.networkFailures.length > 0) {
      body.push('', '### Network Failures', '```');
      for (const f of data.diagnostics.networkFailures.slice(0, 20)) {
        body.push(`${f.status} ${f.statusText} — ${f.url}`);
      }
      body.push('```');
    }
  }

  const labels = ['bug', 'e2e', ...(data.labels ?? [])];

  try {
    const result = execSync(
      `gh issue create --title ${escapeShell(data.title)} --body ${escapeShell(body.join('\n'))} --label ${escapeShell(labels.join(','))}`,
      { encoding: 'utf-8', timeout: 15_000 },
    );
    return result.trim();
  } catch {
    console.warn('[e2e helpers] Could not create GitHub issue — gh CLI may not be available');
    return undefined;
  }
}

function escapeShell(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
