/**
 * Tests for the WebCrypto-based AWS SigV4 signer.
 *
 * Golden vectors come from the official AWS documentation:
 * - Header signing: the IAM `ListUsers` example from the SigV4 signing docs
 *   (credentials AKIDEXAMPLE, date 2015-08-30T12:36:00Z).
 * - Presigning: the S3 query-string authentication example
 *   (credentials AKIAIOSFODNN7EXAMPLE, date 2013-05-24T00:00:00Z).
 */

// jsdom does not provide crypto.subtle or TextEncoder/TextDecoder —
// install Node's implementations.
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

import {
  signAwsRequestHeaders,
  presignAwsUrl,
  resolveAwsCredentials,
} from '../../../../src/utils/aws/sigv4';

describe('resolveAwsCredentials', () => {
  it('should pass through static credentials', async () => {
    const credentials = { accessKeyId: 'AKID', secretAccessKey: 'SECRET' };
    await expect(resolveAwsCredentials(credentials)).resolves.toEqual(credentials);
  });

  it('should invoke async factories', async () => {
    const factory = jest.fn().mockResolvedValue({
      accessKeyId: 'ASIA123',
      secretAccessKey: 'TEMP',
      sessionToken: 'TOKEN',
    });

    const resolved = await resolveAwsCredentials(factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(resolved.accessKeyId).toBe('ASIA123');
    expect(resolved.sessionToken).toBe('TOKEN');
  });

  it('should reject credentials missing required fields', async () => {
    await expect(
      resolveAwsCredentials({ accessKeyId: '', secretAccessKey: 'x' })
    ).rejects.toThrow('AWS credentials must include');
    await expect(
      resolveAwsCredentials(async () => ({ accessKeyId: 'x', secretAccessKey: '' }))
    ).rejects.toThrow('AWS credentials must include');
  });
});

describe('signAwsRequestHeaders', () => {
  it('should reproduce the AWS documentation IAM ListUsers signature', async () => {
    const headers = await signAwsRequestHeaders({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      service: 'iam',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      },
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      date: new Date('2015-08-30T12:36:00Z'),
    });

    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, ' +
        'SignedHeaders=content-type;host;x-amz-date, ' +
        'Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7'
    );
    // host is signed but not returned — fetch sets it automatically
    expect(headers['host']).toBeUndefined();
  });

  it('should sign the payload hash into the signature', async () => {
    const base = {
      method: 'POST',
      url: 'https://polly.us-east-1.amazonaws.com/v1/speech',
      service: 'polly',
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      date: new Date('2026-07-13T00:00:00Z'),
    };

    const a = await signAwsRequestHeaders({ ...base, body: '{"Text":"hello"}' });
    const b = await signAwsRequestHeaders({ ...base, body: '{"Text":"world"}' });

    expect(a['authorization']).not.toBe(b['authorization']);
  });

  it('should produce identical signatures for string and byte payloads', async () => {
    const base = {
      url: 'https://polly.eu-west-2.amazonaws.com/v1/speech',
      service: 'polly',
      region: 'eu-west-2',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      date: new Date('2026-07-13T00:00:00Z'),
    };

    const asString = await signAwsRequestHeaders({ ...base, body: '{"a":1}' });
    const asBytes = await signAwsRequestHeaders({
      ...base,
      body: new TextEncoder().encode('{"a":1}'),
    });

    expect(asString['authorization']).toBe(asBytes['authorization']);
  });

  it('should include and sign the session token when present', async () => {
    const headers = await signAwsRequestHeaders({
      url: 'https://polly.us-east-1.amazonaws.com/v1/speech',
      service: 'polly',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'ASIAEXAMPLE',
        secretAccessKey: 'SECRET',
        sessionToken: 'THE-SESSION-TOKEN',
      },
      date: new Date('2026-07-13T00:00:00Z'),
    });

    expect(headers['x-amz-security-token']).toBe('THE-SESSION-TOKEN');
    expect(headers['authorization']).toContain(
      'SignedHeaders=host;x-amz-date;x-amz-security-token'
    );
  });
});

describe('presignAwsUrl', () => {
  it('should reproduce the AWS documentation S3 presigned-URL signature', async () => {
    const url = await presignAwsUrl({
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      service: 's3',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      },
      expiresIn: 86400,
      date: new Date('2013-05-24T00:00:00Z'),
      payloadHash: 'UNSIGNED-PAYLOAD',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
      'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request'
    );
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20130524T000000Z');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('86400');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBe(
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'
    );
  });

  it('should presign a Transcribe streaming URL with service parameters intact', async () => {
    const url = await presignAwsUrl({
      url:
        'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket' +
        '?language-code=en-US&media-encoding=pcm&sample-rate=16000',
      service: 'transcribe',
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'SECRET' },
      expiresIn: 300,
      date: new Date('2026-07-13T10:00:00Z'),
    });

    expect(url).toMatch(
      /^wss:\/\/transcribestreaming\.us-east-1\.amazonaws\.com:8443\/stream-transcription-websocket\?/
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('language-code')).toBe('en-US');
    expect(parsed.searchParams.get('media-encoding')).toBe('pcm');
    expect(parsed.searchParams.get('sample-rate')).toBe('16000');
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
      'AKIDEXAMPLE/20260713/us-east-1/transcribe/aws4_request'
    );
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.searchParams.get('X-Amz-Security-Token')).toBeNull();
  });

  it('should include the session token as a signed query parameter', async () => {
    const url = await presignAwsUrl({
      url: 'wss://transcribestreaming.eu-west-2.amazonaws.com:8443/stream-transcription-websocket?sample-rate=16000',
      service: 'transcribe',
      region: 'eu-west-2',
      credentials: {
        accessKeyId: 'ASIAEXAMPLE',
        secretAccessKey: 'SECRET',
        sessionToken: 'SESSION/TOKEN+VALUE=',
      },
      date: new Date('2026-07-13T10:00:00Z'),
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('X-Amz-Security-Token')).toBe('SESSION/TOKEN+VALUE=');
    // Reserved characters must be RFC 3986 encoded in the raw URL
    expect(url).toContain('X-Amz-Security-Token=SESSION%2FTOKEN%2BVALUE%3D');
  });

  it('should change the signature when query parameters change', async () => {
    const base = {
      service: 'transcribe',
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
      date: new Date('2026-07-13T10:00:00Z'),
    };

    const a = await presignAwsUrl({
      ...base,
      url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?sample-rate=16000',
    });
    const b = await presignAwsUrl({
      ...base,
      url: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?sample-rate=8000',
    });

    expect(new URL(a).searchParams.get('X-Amz-Signature')).not.toBe(
      new URL(b).searchParams.get('X-Amz-Signature')
    );
  });
});
