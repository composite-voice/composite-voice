/**
 * AWS Signature Version 4 (SigV4) request signer built on WebCrypto.
 *
 * @remarks
 * Implements both SigV4 signing styles used by AWS speech services:
 *
 * - **Header signing** ({@link signAwsRequestHeaders}) — computes an
 *   `Authorization: AWS4-HMAC-SHA256 ...` header for REST requests
 *   (e.g. Amazon Polly `POST /v1/speech`).
 * - **Query-string presigning** ({@link presignAwsUrl}) — appends
 *   `X-Amz-*` query parameters to a URL so the request authenticates
 *   without headers. Required for browser WebSocket connections
 *   (e.g. Amazon Transcribe streaming), where custom headers cannot be set.
 *
 * All hashing uses `crypto.subtle` (SHA-256 digests and HMAC-SHA256
 * signatures), so the signer works in every modern browser and in
 * Node.js 18+ without any dependency on `aws4`, the AWS SDK, or
 * Node's `crypto` module.
 *
 * Temporary credentials (STS/Cognito) are supported via the optional
 * `sessionToken`, which is signed as `X-Amz-Security-Token`.
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html
 *
 * @packageDocumentation
 */

/**
 * A static set of AWS credentials.
 *
 * @remarks
 * `sessionToken` is required when using temporary credentials from
 * STS or Cognito — the recommended pattern for browser usage, where
 * long-lived keys must never be embedded.
 */
export interface AwsCredentials {
  /** AWS access key ID (e.g. `'AKIA...'` or a temporary `'ASIA...'` key). */
  accessKeyId: string;
  /** AWS secret access key paired with {@link AwsCredentials.accessKeyId}. */
  secretAccessKey: string;
  /** Session token for temporary credentials (STS `AssumeRole`, Cognito). */
  sessionToken?: string;
}

/**
 * AWS credentials as a static object or an async factory.
 *
 * @remarks
 * Pass a factory to fetch fresh temporary credentials on every use — the
 * browser-safe pattern, mirroring the SDK's async `apiKey` factories.
 *
 * @example
 * ```ts
 * const credentials: AwsCredentialsProvider = async () => {
 *   const res = await fetch('/api/aws-temp-credentials');
 *   return res.json(); // { accessKeyId, secretAccessKey, sessionToken }
 * };
 * ```
 */
export type AwsCredentialsProvider = AwsCredentials | (() => Promise<AwsCredentials>);

/**
 * Resolve an {@link AwsCredentialsProvider} to a concrete credentials object,
 * invoking the factory when one is supplied.
 *
 * @param provider - Static credentials or an async factory.
 * @returns The resolved credentials.
 *
 * @throws Error when the resolved credentials are missing `accessKeyId`
 *   or `secretAccessKey`.
 */
export async function resolveAwsCredentials(
  provider: AwsCredentialsProvider
): Promise<AwsCredentials> {
  const credentials = typeof provider === 'function' ? await provider() : provider;
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    throw new Error('AWS credentials must include "accessKeyId" and "secretAccessKey"');
  }
  return credentials;
}

/**
 * Options shared by {@link signAwsRequestHeaders} and {@link presignAwsUrl}.
 */
interface SigV4BaseOptions {
  /** Full request URL including any query string. */
  url: string;
  /** AWS service identifier used in the credential scope (e.g. `'polly'`, `'transcribe'`). */
  service: string;
  /** AWS region used in the credential scope (e.g. `'us-east-1'`). */
  region: string;
  /** Credentials to sign with. */
  credentials: AwsCredentials;
  /**
   * Signing time. Defaults to `new Date()`; injectable for deterministic tests.
   */
  date?: Date;
}

/**
 * Options for {@link signAwsRequestHeaders}.
 */
export interface SignAwsRequestOptions extends SigV4BaseOptions {
  /** HTTP method (e.g. `'POST'`). @defaultValue `'POST'` */
  method?: string;
  /**
   * Headers to include in the signature, in addition to `host` and
   * `x-amz-date` (which are always signed). Values must match the headers
   * actually sent on the request byte-for-byte.
   */
  headers?: Record<string, string>;
  /** Request payload. @defaultValue empty body */
  body?: string | Uint8Array;
}

/**
 * Options for {@link presignAwsUrl}.
 */
export interface PresignAwsUrlOptions extends SigV4BaseOptions {
  /** HTTP method the presigned URL authorizes. @defaultValue `'GET'` */
  method?: string;
  /** URL validity window in seconds. @defaultValue `300` (5 minutes, AWS WebSocket maximum) */
  expiresIn?: number;
  /**
   * Hex payload hash placed in the canonical request.
   *
   * @defaultValue SHA-256 of the empty string, which is what AWS WebSocket
   * presigning (Amazon Transcribe streaming) requires. Pass
   * `'UNSIGNED-PAYLOAD'` for S3-style presigning.
   */
  payloadHash?: string;
}

/** @internal Hex-encoded SHA-256 of the empty string. */
const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** @internal The SigV4 algorithm identifier. */
const ALGORITHM = 'AWS4-HMAC-SHA256';

/** @internal Lazily-created text encoder shared across signing calls. */
let sharedEncoder: TextEncoder | null = null;

/** @internal Get the shared UTF-8 encoder (lazy so test polyfills apply first). */
function getEncoder(): TextEncoder {
  sharedEncoder ??= new TextEncoder();
  return sharedEncoder;
}

/**
 * Get the WebCrypto `SubtleCrypto` implementation.
 *
 * @throws Error when `crypto.subtle` is unavailable (non-secure browser
 *   context or a runtime older than Node.js 18).
 * @internal
 */
function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'WebCrypto (crypto.subtle) is not available. AWS SigV4 signing requires a ' +
        'secure browser context or Node.js 18+.'
    );
  }
  return subtle;
}

/** @internal Convert bytes to a lowercase hex string. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** @internal SHA-256 digest returning lowercase hex. */
async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? getEncoder().encode(data) : data;
  const digest = await getSubtle().digest('SHA-256', bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

/** @internal HMAC-SHA256 returning raw bytes. */
async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const subtle = getSubtle();
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await subtle.sign('HMAC', cryptoKey, getEncoder().encode(data) as BufferSource);
  return new Uint8Array(signature);
}

/**
 * Percent-encode per RFC 3986 (SigV4 rules): everything except
 * `A-Z a-z 0-9 - _ . ~` is encoded, including characters that
 * `encodeURIComponent` leaves alone (`! ' ( ) *`).
 *
 * @internal
 */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Build the canonical URI: each path segment URI-encoded (twice, per the
 * SigV4 rules for all services except S3), with `/` separators preserved.
 *
 * @internal
 */
function canonicalUri(pathname: string): string {
  if (!pathname) return '/';
  return (
    pathname
      .split('/')
      .map((segment) => rfc3986Encode(rfc3986Encode(decodeURIComponent(segment))))
      .join('/') || '/'
  );
}

/**
 * Build the canonical query string: parameters RFC 3986 encoded and sorted
 * by encoded name, then by encoded value.
 *
 * @internal
 */
function canonicalQueryString(params: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  params.forEach((value, key) => {
    pairs.push([rfc3986Encode(key), rfc3986Encode(value)]);
  });
  pairs.sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? (aValue < bValue ? -1 : 1) : aKey < bKey ? -1 : 1
  );
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

/** @internal Format a date as the SigV4 `YYYYMMDD'T'HHMMSS'Z'` timestamp. */
function amzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * Derive the SigV4 signing key:
 * `HMAC(HMAC(HMAC(HMAC("AWS4" + secret, date), region), service), "aws4_request")`.
 *
 * @internal
 */
async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<Uint8Array> {
  const kDate = await hmacSha256(getEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * Compute the SigV4 signature for a canonical request.
 *
 * @internal
 */
async function computeSignature(
  canonicalRequest: string,
  timestamp: string,
  scope: string,
  secretAccessKey: string,
  region: string,
  service: string
): Promise<string> {
  const stringToSign = [ALGORITHM, timestamp, scope, await sha256Hex(canonicalRequest)].join('\n');
  const dateStamp = timestamp.slice(0, 8);
  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  return toHex(await hmacSha256(signingKey, stringToSign));
}

/**
 * Sign an HTTP request with SigV4 headers (`Authorization` header style).
 *
 * @remarks
 * Returns the caller's headers plus `x-amz-date`, `authorization`, and —
 * when the credentials carry a session token — `x-amz-security-token`.
 * The `host` header is always included in the signature (derived from the
 * URL) but is not returned, because `fetch` sets it automatically.
 *
 * Any headers passed in `options.headers` are also signed, so their values
 * must be sent on the request unchanged.
 *
 * @param options - The request, scope, and credentials to sign with.
 * @returns Headers to send with the request, including `authorization`.
 *
 * @example
 * ```ts
 * const headers = await signAwsRequestHeaders({
 *   method: 'POST',
 *   url: 'https://polly.us-east-1.amazonaws.com/v1/speech',
 *   service: 'polly',
 *   region: 'us-east-1',
 *   credentials: { accessKeyId, secretAccessKey },
 *   body: JSON.stringify(request),
 * });
 * await fetch(url, { method: 'POST', headers, body });
 * ```
 */
export async function signAwsRequestHeaders(
  options: SignAwsRequestOptions
): Promise<Record<string, string>> {
  const { url, service, region, credentials } = options;
  const method = options.method ?? 'POST';
  const parsed = new URL(url);
  const timestamp = amzDate(options.date ?? new Date());
  const dateStamp = timestamp.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Headers included in the signature: caller headers + host + x-amz-date
  // (+ the session token when present). Keys are lowercased for canonicalization.
  const signableHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    signableHeaders[name.toLowerCase()] = value;
  }
  signableHeaders['host'] = parsed.host;
  signableHeaders['x-amz-date'] = timestamp;
  if (credentials.sessionToken) {
    signableHeaders['x-amz-security-token'] = credentials.sessionToken;
  }

  const sortedNames = Object.keys(signableHeaders).sort();
  const canonicalHeaders = sortedNames
    .map((name) => `${name}:${(signableHeaders[name] as string).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = sortedNames.join(';');

  const payloadHash =
    options.body == null || options.body.length === 0
      ? EMPTY_BODY_SHA256
      : await sha256Hex(options.body);

  const canonicalRequest = [
    method,
    canonicalUri(parsed.pathname),
    canonicalQueryString(parsed.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const signature = await computeSignature(
    canonicalRequest,
    timestamp,
    scope,
    credentials.secretAccessKey,
    region,
    service
  );

  const result: Record<string, string> = {
    ...options.headers,
    'x-amz-date': timestamp,
    authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (credentials.sessionToken) {
    result['x-amz-security-token'] = credentials.sessionToken;
  }
  return result;
}

/**
 * Presign a URL with SigV4 query parameters (`X-Amz-*` query style).
 *
 * @remarks
 * Produces a URL that authenticates without any headers — the mechanism
 * AWS WebSocket APIs (Amazon Transcribe streaming) require, since browsers
 * cannot attach headers to WebSocket handshakes. Only the `host` header is
 * signed; the payload hash defaults to the SHA-256 of an empty string.
 *
 * Existing query parameters on the input URL (e.g. `language-code`,
 * `sample-rate`) are included in the signature. When the credentials carry
 * a session token, `X-Amz-Security-Token` is added and signed.
 *
 * @param options - The URL, scope, credentials, and expiry to presign with.
 * @returns The input URL with `X-Amz-*` authentication parameters appended.
 *
 * @example
 * ```ts
 * const url = await presignAwsUrl({
 *   url:
 *     'wss://transcribestreaming.us-east-1.amazonaws.com:8443' +
 *     '/stream-transcription-websocket?language-code=en-US&media-encoding=pcm&sample-rate=16000',
 *   service: 'transcribe',
 *   region: 'us-east-1',
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   expiresIn: 300,
 * });
 * const socket = new WebSocket(url);
 * ```
 */
export async function presignAwsUrl(options: PresignAwsUrlOptions): Promise<string> {
  const { url, service, region, credentials } = options;
  const method = options.method ?? 'GET';
  const parsed = new URL(url);
  const timestamp = amzDate(options.date ?? new Date());
  const dateStamp = timestamp.slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query = new URLSearchParams(parsed.searchParams);
  query.set('X-Amz-Algorithm', ALGORITHM);
  query.set('X-Amz-Credential', `${credentials.accessKeyId}/${scope}`);
  query.set('X-Amz-Date', timestamp);
  query.set('X-Amz-Expires', String(options.expiresIn ?? 300));
  query.set('X-Amz-SignedHeaders', 'host');
  if (credentials.sessionToken) {
    query.set('X-Amz-Security-Token', credentials.sessionToken);
  }

  const canonicalRequest = [
    method,
    canonicalUri(parsed.pathname),
    canonicalQueryString(query),
    `host:${parsed.host}\n`,
    'host',
    options.payloadHash ?? EMPTY_BODY_SHA256,
  ].join('\n');

  const signature = await computeSignature(
    canonicalRequest,
    timestamp,
    scope,
    credentials.secretAccessKey,
    region,
    service
  );

  query.set('X-Amz-Signature', signature);
  // Assemble the final URL manually so the query string keeps the exact
  // canonical (RFC 3986) encoding that was signed — the URL class would
  // re-normalize percent-encodings.
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}?${canonicalQueryString(query)}`;
}
