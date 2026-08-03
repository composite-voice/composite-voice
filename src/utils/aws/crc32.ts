/**
 * CRC32 checksum (IEEE 802.3 polynomial) used by the AWS event-stream codec.
 *
 * @remarks
 * Implements the standard reflected CRC-32 algorithm with a lazily-built
 * 256-entry lookup table. This is the same checksum used by zlib/PNG and by
 * `application/vnd.amazon.eventstream` message framing (prelude CRC and
 * trailing message CRC).
 *
 * No dependencies — implemented locally so the SDK stays zero-dependency.
 *
 * @packageDocumentation
 */

/** @internal Lazily-initialized CRC32 lookup table. */
let CRC_TABLE: Uint32Array | null = null;

/**
 * Build the 256-entry CRC32 lookup table for the reflected polynomial
 * `0xEDB88320`.
 *
 * @internal
 */
function buildTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/**
 * Compute the CRC32 checksum of a byte buffer.
 *
 * @remarks
 * Uses the IEEE 802.3 (zlib) polynomial in its reflected form. The result is
 * an unsigned 32-bit integer, matching the value AWS event-stream messages
 * carry in their prelude CRC and message CRC fields.
 *
 * @param data - The bytes to checksum.
 * @param previous - Optional running CRC from a previous call, for
 *   incremental computation over concatenated buffers.
 * @returns The unsigned 32-bit CRC32 value.
 *
 * @example
 * ```ts
 * import { crc32 } from 'composite-voice/utils';
 *
 * crc32(new TextEncoder().encode('hello')); // 0x3610a686
 * ```
 */
export function crc32(data: Uint8Array, previous = 0): number {
  CRC_TABLE ??= buildTable();
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
