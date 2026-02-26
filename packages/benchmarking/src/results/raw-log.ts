/**
 * Raw event log writer — Section 8.4 of METHODOLOGY.md
 *
 * Writes NDJSON event logs during benchmark execution and computes
 * the SHA-256 hash for provenance (Section 8.4.2).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { RawLogInfo } from '../types/schema.js';

export interface RawLogEvent {
  runId: string;
  trialIndex: number;
  inputId: string;
  event: {
    type: string;
    timestamp: number;
    [key: string]: unknown;
  };
}

/**
 * Manages writing raw event logs to a temporary NDJSON file.
 * Computes SHA-256 hash on finalization for inclusion in the result file.
 */
export class RawLogWriter {
  private filePath: string;
  private fd: number;
  private eventCount = 0;
  private byteSize = 0;

  constructor(runId: string, testId: string) {
    const dir = path.join(os.tmpdir(), 'composite-voice-bench', runId);
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, `${testId}.events.ndjson`);
    this.fd = fs.openSync(this.filePath, 'w');
  }

  /**
   * Append an event to the log.
   */
  write(event: RawLogEvent): void {
    const line = JSON.stringify(event) + '\n';
    const bytes = Buffer.byteLength(line, 'utf-8');
    fs.writeSync(this.fd, line);
    this.eventCount++;
    this.byteSize += bytes;
  }

  /**
   * Finalize the log: close the file and compute the SHA-256 hash.
   * Returns the RawLogInfo for inclusion in the result file.
   */
  finalize(): RawLogInfo {
    fs.closeSync(this.fd);

    const hash = createHash('sha256');
    const content = fs.readFileSync(this.filePath);
    hash.update(content);

    return {
      hash: `sha256:${hash.digest('hex')}`,
      byteSize: this.byteSize,
      eventCount: this.eventCount,
      storagePath: null, // Set by external upload step if configured
    };
  }

  /**
   * Get the path to the raw log file (for external upload).
   */
  getFilePath(): string {
    return this.filePath;
  }
}
