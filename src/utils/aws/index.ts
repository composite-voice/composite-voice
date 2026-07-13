/**
 * @packageDocumentation
 * AWS utility modules: SigV4 signing and the event-stream codec.
 *
 * @remarks
 * Shared infrastructure for the AWS providers ({@link PollyTTS},
 * {@link TranscribeSTT}) and the proxy's AWS signing support. Everything
 * here is dependency-free: signing uses WebCrypto (`crypto.subtle`) and
 * the event-stream codec implements its own CRC32.
 */

export * from './crc32';
export * from './sigv4';
export * from './eventstream';
