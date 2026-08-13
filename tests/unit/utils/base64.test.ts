/**
 * Tests for base64 audio helpers used by realtime agent WebSocket frames.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../src/utils/base64';

describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
  it('round-trips binary audio', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const encoded = arrayBufferToBase64(original.buffer);
    const decoded = base64ToArrayBuffer(encoded);

    expect(decoded).toBeDefined();
    expect(new Uint8Array(decoded!)).toEqual(original);
  });

  it('returns undefined for malformed input instead of throwing', () => {
    expect(() => base64ToArrayBuffer('%%%not-base64%%%')).not.toThrow();
    expect(base64ToArrayBuffer('%%%not-base64%%%')).toBeUndefined();
  });

  it('decodes an empty string to an empty buffer', () => {
    const decoded = base64ToArrayBuffer('');
    expect(decoded).toBeDefined();
    expect(decoded!.byteLength).toBe(0);
  });
});
