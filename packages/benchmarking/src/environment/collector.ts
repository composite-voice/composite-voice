/**
 * Environment metadata collection — Section 7 of METHODOLOGY.md
 *
 * Collects hardware, software, network, and provider version information
 * from the current machine. This data is included in every result file
 * to satisfy the Repeatable principle.
 */

import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { EnvironmentInfo, HardwareInfo, SoftwareInfo, NetworkInfo, PingInfo } from '../types/schema.js';

/**
 * Safely execute a shell command and return trimmed stdout.
 * Returns fallback string on failure.
 */
function exec(cmd: string, fallback = 'unknown'): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10_000 }).trim();
  } catch {
    return fallback;
  }
}

/**
 * Detect CPU information.
 */
function detectCPU(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return exec('sysctl -n machdep.cpu.brand_string');
  }
  if (platform === 'linux') {
    const info = exec("grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2");
    const cores = os.cpus().length;
    return `${info.trim()}, ${cores}-core`;
  }

  return `${os.arch()}, ${os.cpus().length}-core`;
}

/**
 * Detect network interface type.
 */
function detectNetworkType(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    const route = exec("route get default 2>/dev/null | grep interface | awk '{print $2}'", '');
    if (route.startsWith('en0')) return 'Wi-Fi';
    if (route.startsWith('en')) return 'Ethernet';
    return route || 'unknown';
  }

  if (platform === 'linux') {
    const route = exec("ip route show default 2>/dev/null | awk '{print $5}'", '');
    if (route.startsWith('wl')) return 'Wi-Fi';
    if (route.startsWith('eth') || route.startsWith('en')) return 'Ethernet';
    return route || 'unknown';
  }

  return 'unknown';
}

function collectHardware(): HardwareInfo {
  return {
    cpu: detectCPU(),
    ram: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
    gpu: null, // Not detectable portably; set manually for WebLLM benchmarks
    network: detectNetworkType(),
    disk: 'unknown', // Not easily detectable portably
  };
}

/**
 * Find the SDK commit hash by walking up to the repo root.
 */
function findSdkCommit(): string {
  return exec('git rev-parse --short HEAD', 'unknown');
}

/**
 * Find the SDK version from the root package.json.
 */
function findSdkVersion(): string {
  try {
    // Walk up from this file to find the workspace root package.json
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === '@lukeocodes/composite-voice') {
          return pkg.version || 'unknown';
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function collectSoftware(): SoftwareInfo {
  return {
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    sdkVersion: findSdkVersion(),
    sdkCommit: findSdkCommit(),
    pnpmVersion: exec('pnpm --version', 'unknown'),
  };
}

/**
 * Ping a host and return mean/stddev in ms.
 * Uses 5 pings to get a reasonable sample.
 */
export function pingHost(host: string): PingInfo {
  const platform = os.platform();
  const countFlag = platform === 'darwin' || platform === 'linux' ? '-c' : '-n';

  try {
    const output = execSync(`ping ${countFlag} 5 ${host}`, {
      encoding: 'utf-8',
      timeout: 15_000,
    });

    // Parse ping times from output
    const times: number[] = [];
    const timeRegex = /time[=<]([\d.]+)\s*ms/g;
    let match;
    while ((match = timeRegex.exec(output)) !== null) {
      times.push(parseFloat(match[1]));
    }

    if (times.length === 0) {
      return { host, meanMs: -1, stdDevMs: -1 };
    }

    const meanMs = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + (t - meanMs) ** 2, 0) / times.length;

    return {
      host,
      meanMs: Math.round(meanMs * 100) / 100,
      stdDevMs: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  } catch {
    return { host, meanMs: -1, stdDevMs: -1 };
  }
}

/**
 * Map provider names to their API hostnames for ping measurement.
 */
const PROVIDER_HOSTS: Record<string, string> = {
  deepgram: 'api.deepgram.com',
  assemblyai: 'api.assemblyai.com',
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  groq: 'api.groq.com',
  mistral: 'api.mistral.ai',
  gemini: 'generativelanguage.googleapis.com',
  elevenlabs: 'api.elevenlabs.io',
  cartesia: 'api.cartesia.ai',
};

/**
 * Collect full environment metadata for a benchmark run.
 */
export function collectEnvironment(providerName: string): EnvironmentInfo {
  const host = PROVIDER_HOSTS[providerName] || providerName;

  return {
    hardware: collectHardware(),
    software: collectSoftware(),
    network: {
      isp: 'unknown', // Requires external lookup; set manually or via API
      geography: 'unknown', // Same as above
      pingToProvider: pingHost(host),
      bandwidthDown: 'unknown',
      bandwidthUp: 'unknown',
    },
    providerVersions: {
      apiVersion: 'unknown', // Set by runner per provider
      sdkPackage: 'unknown', // Set by runner per provider
    },
  };
}
