/**
 * G.711 audio codec utilities (mu-law and A-law).
 *
 * @packageDocumentation
 *
 * @remarks
 * This module implements the ITU-T G.711 companding algorithms used by
 * telephony platforms. Twilio Media Streams speak mu-law at 8 kHz;
 * European telephony trunks and some carrier WebSocket APIs use A-law.
 * The implementations follow the classic Sun Microsystems reference code
 * (as used by SoX, FFmpeg, and the `alawmulaw` JS library) and operate on
 * 16-bit signed linear PCM.
 *
 * **Data-flow diagram:**
 *
 * ```
 * TTS linear16  ──encodeMulaw()──>  8-bit mu-law  ──> Twilio <Stream>
 * Twilio media  ──decodeMulaw()──>  linear16      ──> STT provider
 * ```
 *
 * All functions are pure and allocation-per-call; there is no shared state.
 *
 * @example
 * ```typescript
 * import { encodeMulaw, decodeMulaw } from './g711';
 *
 * // Decode a Twilio media payload to linear PCM for an STT provider
 * const mulawBytes = new Uint8Array(base64Decode(payload));
 * const pcm = decodeMulaw(mulawBytes); // Int16Array
 *
 * // Encode TTS PCM for playback into the call
 * const encoded = encodeMulaw(pcm); // Uint8Array, 1 byte per sample
 * ```
 *
 * @see {@link https://www.itu.int/rec/T-REC-G.711 | ITU-T G.711} for the specification
 */

/** Bias added to mu-law samples before companding (ITU-T G.711). */
const MULAW_BIAS = 0x84;

/** Maximum linear sample magnitude representable in mu-law. */
const MULAW_CLIP = 32635;

/**
 * Encode one 16-bit linear PCM sample to 8-bit mu-law.
 *
 * @remarks
 * Follows the Sun Microsystems reference implementation: the sample is
 * biased, clamped, and compressed into a sign bit, 3-bit exponent, and
 * 4-bit mantissa, then bit-inverted as required by G.711.
 *
 * @param sample - Signed 16-bit PCM sample (values outside the 16-bit
 *   range are clamped).
 * @returns The mu-law byte (0-255).
 *
 * @example
 * ```typescript
 * encodeMulawSample(0);      // 0xFF (positive zero)
 * encodeMulawSample(32767);  // 0x80 (maximum positive)
 * encodeMulawSample(-32768); // 0x00 (maximum negative)
 * ```
 */
export function encodeMulawSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = (s >> 8) & 0x80;
  if (sign !== 0) s = -s;
  if (s > MULAW_CLIP) s = MULAW_CLIP;
  s += MULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--) {
    mask >>= 1;
  }

  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Decode one 8-bit mu-law byte to a 16-bit linear PCM sample.
 *
 * @param mulawByte - The mu-law byte (0-255).
 * @returns The signed 16-bit PCM sample.
 *
 * @example
 * ```typescript
 * decodeMulawSample(0xFF); // 0
 * decodeMulawSample(0x80); // 32124 (near maximum positive)
 * ```
 */
export function decodeMulawSample(mulawByte: number): number {
  const u = ~mulawByte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = (((mantissa << 3) + MULAW_BIAS) << exponent) - MULAW_BIAS;
  if (sign !== 0) sample = -sample;
  return sample;
}

/**
 * Encode 16-bit linear PCM to 8-bit mu-law.
 *
 * @param pcm - Signed 16-bit PCM samples.
 * @returns One mu-law byte per input sample.
 *
 * @see {@link decodeMulaw} for the inverse operation
 */
export function encodeMulaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = encodeMulawSample(pcm[i] as number);
  }
  return out;
}

/**
 * Decode 8-bit mu-law to 16-bit linear PCM.
 *
 * @param mulaw - Mu-law bytes (e.g. a decoded Twilio media payload).
 * @returns One signed 16-bit PCM sample per input byte.
 *
 * @see {@link encodeMulaw} for the inverse operation
 */
export function decodeMulaw(mulaw: Uint8Array): Int16Array {
  const out = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) {
    out[i] = decodeMulawSample(mulaw[i] as number);
  }
  return out;
}

/** Segment boundaries for A-law companding (13-bit domain). */
const ALAW_SEG_END = [0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff];

/**
 * Encode one 16-bit linear PCM sample to 8-bit A-law.
 *
 * @remarks
 * A-law operates on a 13-bit domain, so the sample is shifted right by
 * three bits before companding. The result is XOR-masked with `0x55`
 * (even-bit inversion) as required by G.711.
 *
 * @param sample - Signed 16-bit PCM sample (values outside the 16-bit
 *   range are clamped).
 * @returns The A-law byte (0-255).
 */
export function encodeAlawSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample))) >> 3;
  let mask: number;
  if (s >= 0) {
    mask = 0xd5; // sign bit = 1 (positive), then even-bit inversion
  } else {
    mask = 0x55;
    s = -s - 1;
  }

  let seg = 8;
  for (let i = 0; i < ALAW_SEG_END.length; i++) {
    if (s <= (ALAW_SEG_END[i] as number)) {
      seg = i;
      break;
    }
  }
  if (seg >= 8) return 0x7f ^ mask;

  let aval = seg << 4;
  aval |= seg < 2 ? (s >> 1) & 0x0f : (s >> seg) & 0x0f;
  return aval ^ mask;
}

/**
 * Decode one 8-bit A-law byte to a 16-bit linear PCM sample.
 *
 * @param alawByte - The A-law byte (0-255).
 * @returns The signed 16-bit PCM sample.
 */
export function decodeAlawSample(alawByte: number): number {
  const a = alawByte ^ 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) {
    t += 8;
  } else if (seg === 1) {
    t += 0x108;
  } else {
    t += 0x108;
    t <<= seg - 1;
  }
  return (a & 0x80) !== 0 ? t : -t;
}

/**
 * Encode 16-bit linear PCM to 8-bit A-law.
 *
 * @param pcm - Signed 16-bit PCM samples.
 * @returns One A-law byte per input sample.
 *
 * @see {@link decodeAlaw} for the inverse operation
 */
export function encodeAlaw(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = encodeAlawSample(pcm[i] as number);
  }
  return out;
}

/**
 * Decode 8-bit A-law to 16-bit linear PCM.
 *
 * @param alaw - A-law bytes.
 * @returns One signed 16-bit PCM sample per input byte.
 *
 * @see {@link encodeAlaw} for the inverse operation
 */
export function decodeAlaw(alaw: Uint8Array): Int16Array {
  const out = new Int16Array(alaw.length);
  for (let i = 0; i < alaw.length; i++) {
    out[i] = decodeAlawSample(alaw[i] as number);
  }
  return out;
}
