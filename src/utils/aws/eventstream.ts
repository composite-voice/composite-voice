/**
 * Codec for the AWS `application/vnd.amazon.eventstream` binary format.
 *
 * @remarks
 * AWS streaming APIs (Amazon Transcribe streaming, Bedrock, S3 Select, …)
 * frame every message in a compact binary envelope:
 *
 * ```
 * +------------+---------------+--------------+---------+---------+-------------+
 * | total len  | headers len   | prelude CRC  | headers | payload | message CRC |
 * | uint32 BE  | uint32 BE     | uint32 BE    |         |         | uint32 BE   |
 * +------------+---------------+--------------+---------+---------+-------------+
 * ```
 *
 * - **Prelude CRC** — CRC32 of the first 8 bytes (total length + headers length).
 * - **Headers** — a sequence of `[name length (1)][name][value type (1)][value]`
 *   entries. String values (type 7) carry a 2-byte big-endian length prefix.
 * - **Message CRC** — CRC32 of the entire message up to (excluding) this field.
 *
 * {@link encodeEventStreamMessage} produces messages with string headers
 * (the only header type AWS speech services use on outbound events, e.g.
 * `:message-type`, `:event-type`, `:content-type`).
 * {@link decodeEventStreamMessage} understands all nine header value types
 * and validates both CRCs.
 *
 * Implemented locally (see {@link crc32}) so the SDK stays zero-dependency —
 * no `@aws-sdk/eventstream-codec` import.
 *
 * @packageDocumentation
 */

import { crc32 } from './crc32';

/**
 * A decoded event-stream header value.
 *
 * @remarks
 * String headers (`type: 'string'`) are what AWS speech services use for
 * message routing (`:message-type`, `:event-type`, `:exception-type`,
 * `:content-type`). The remaining types are decoded for completeness.
 */
export type EventStreamHeaderValue = string | number | bigint | boolean | Uint8Array | Date;

/**
 * A decoded `application/vnd.amazon.eventstream` message.
 */
export interface EventStreamMessage {
  /** Message headers keyed by name (e.g. `':message-type'`). */
  headers: Record<string, EventStreamHeaderValue>;
  /** Raw message payload (JSON text or binary audio, per `:content-type`). */
  payload: Uint8Array;
}

/** @internal Header value type codes from the event-stream specification. */
const enum HeaderType {
  BoolTrue = 0,
  BoolFalse = 1,
  Byte = 2,
  Short = 3,
  Integer = 4,
  Long = 5,
  ByteArray = 6,
  String = 7,
  Timestamp = 8,
  Uuid = 9,
}

/** @internal Lazily-created shared UTF-8 codecs (lazy so test polyfills apply first). */
let sharedEncoder: TextEncoder | null = null;
let sharedDecoder: TextDecoder | null = null;

/** @internal Get the shared UTF-8 encoder. */
function getEncoder(): TextEncoder {
  sharedEncoder ??= new TextEncoder();
  return sharedEncoder;
}

/** @internal Get the shared UTF-8 decoder. */
function getDecoder(): TextDecoder {
  sharedDecoder ??= new TextDecoder('utf-8');
  return sharedDecoder;
}

/**
 * Encode an event-stream message with string headers.
 *
 * @remarks
 * All header values are written as type 7 (string) entries — the format
 * AWS speech services expect on client-to-server events such as Amazon
 * Transcribe's `AudioEvent`.
 *
 * @param headers - Header name/value pairs (e.g. `{ ':message-type': 'event' }`).
 * @param payload - Raw payload bytes (e.g. a PCM audio chunk).
 * @returns The framed binary message, including prelude and CRCs.
 *
 * @example
 * ```ts
 * const frame = encodeEventStreamMessage(
 *   {
 *     ':message-type': 'event',
 *     ':event-type': 'AudioEvent',
 *     ':content-type': 'application/octet-stream',
 *   },
 *   new Uint8Array(pcmChunk)
 * );
 * websocket.send(frame);
 * ```
 */
export function encodeEventStreamMessage(
  headers: Record<string, string>,
  payload: Uint8Array
): Uint8Array {
  // --- Encode headers block ---
  const headerChunks: Uint8Array[] = [];
  let headersLength = 0;
  for (const [name, value] of Object.entries(headers)) {
    const nameBytes = getEncoder().encode(name);
    const valueBytes = getEncoder().encode(value);
    if (nameBytes.length > 255) {
      throw new Error(`Event-stream header name too long: ${name}`);
    }
    if (valueBytes.length > 0xffff) {
      throw new Error(`Event-stream header value too long for: ${name}`);
    }
    const chunk = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length);
    const view = new DataView(chunk.buffer);
    let offset = 0;
    view.setUint8(offset, nameBytes.length);
    offset += 1;
    chunk.set(nameBytes, offset);
    offset += nameBytes.length;
    view.setUint8(offset, HeaderType.String);
    offset += 1;
    view.setUint16(offset, valueBytes.length, false);
    offset += 2;
    chunk.set(valueBytes, offset);
    headerChunks.push(chunk);
    headersLength += chunk.length;
  }

  // --- Assemble message: prelude (8) + prelude CRC (4) + headers + payload + message CRC (4) ---
  const totalLength = 12 + headersLength + payload.length + 4;
  const message = new Uint8Array(totalLength);
  const view = new DataView(message.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, headersLength, false);
  view.setUint32(8, crc32(message.subarray(0, 8)), false);

  let offset = 12;
  for (const chunk of headerChunks) {
    message.set(chunk, offset);
    offset += chunk.length;
  }
  message.set(payload, offset);
  offset += payload.length;

  view.setUint32(offset, crc32(message.subarray(0, offset)), false);
  return message;
}

/**
 * Decode a framed event-stream message, validating both CRCs.
 *
 * @param data - The complete binary message (one WebSocket frame from AWS).
 * @returns The decoded headers and payload.
 *
 * @throws Error when the buffer is truncated, a length field is
 *   inconsistent, a CRC check fails, or a header value type is unknown.
 *
 * @example
 * ```ts
 * const message = decodeEventStreamMessage(event.data);
 * if (message.headers[':message-type'] === 'event') {
 *   const body = JSON.parse(new TextDecoder().decode(message.payload));
 * }
 * ```
 */
export function decodeEventStreamMessage(data: Uint8Array | ArrayBuffer): EventStreamMessage {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 16) {
    throw new Error(`Event-stream message too short: ${bytes.length} bytes`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalLength = view.getUint32(0, false);
  const headersLength = view.getUint32(4, false);
  const preludeCrc = view.getUint32(8, false);

  if (totalLength !== bytes.length) {
    throw new Error(
      `Event-stream length mismatch: prelude says ${totalLength}, buffer is ${bytes.length}`
    );
  }
  const computedPreludeCrc = crc32(bytes.subarray(0, 8));
  if (computedPreludeCrc !== preludeCrc) {
    throw new Error('Event-stream prelude CRC mismatch');
  }
  const messageCrc = view.getUint32(totalLength - 4, false);
  const computedMessageCrc = crc32(bytes.subarray(0, totalLength - 4));
  if (computedMessageCrc !== messageCrc) {
    throw new Error('Event-stream message CRC mismatch');
  }

  const headersEnd = 12 + headersLength;
  if (headersEnd + 4 > totalLength) {
    throw new Error('Event-stream headers length exceeds message length');
  }

  // --- Decode headers ---
  const headers: Record<string, EventStreamHeaderValue> = {};
  let offset = 12;
  while (offset < headersEnd) {
    const nameLength = view.getUint8(offset);
    offset += 1;
    const name = getDecoder().decode(bytes.subarray(offset, offset + nameLength));
    offset += nameLength;
    const type = view.getUint8(offset);
    offset += 1;

    switch (type) {
      case HeaderType.BoolTrue:
        headers[name] = true;
        break;
      case HeaderType.BoolFalse:
        headers[name] = false;
        break;
      case HeaderType.Byte:
        headers[name] = view.getInt8(offset);
        offset += 1;
        break;
      case HeaderType.Short:
        headers[name] = view.getInt16(offset, false);
        offset += 2;
        break;
      case HeaderType.Integer:
        headers[name] = view.getInt32(offset, false);
        offset += 4;
        break;
      case HeaderType.Long:
        headers[name] = view.getBigInt64(offset, false);
        offset += 8;
        break;
      case HeaderType.ByteArray: {
        const length = view.getUint16(offset, false);
        offset += 2;
        headers[name] = bytes.slice(offset, offset + length);
        offset += length;
        break;
      }
      case HeaderType.String: {
        const length = view.getUint16(offset, false);
        offset += 2;
        headers[name] = getDecoder().decode(bytes.subarray(offset, offset + length));
        offset += length;
        break;
      }
      case HeaderType.Timestamp:
        headers[name] = new Date(Number(view.getBigInt64(offset, false)));
        offset += 8;
        break;
      case HeaderType.Uuid: {
        const hex = toHex(bytes.subarray(offset, offset + 16));
        headers[name] =
          `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
          `${hex.slice(16, 20)}-${hex.slice(20)}`;
        offset += 16;
        break;
      }
      default:
        throw new Error(`Unknown event-stream header value type: ${type}`);
    }
  }

  return { headers, payload: bytes.slice(headersEnd, totalLength - 4) };
}

/** @internal Convert bytes to a lowercase hex string. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
