Good problem. You need to **sniff the format first**, then hand off to the right boundary finder. Here's a fast approach:

## Magic Byte Detection

Most formats are identifiable within the first **12 bytes**:

```js
function detectAudioFormat(buffer) {
  const view = new Uint8Array(buffer);

  // WAV: "RIFF....WAVE"
  if (
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x41 &&
    view[10] === 0x56 &&
    view[11] === 0x45
  )
    return 'wav';

  // OGG: "OggS"
  if (view[0] === 0x4f && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) return 'ogg';

  // FLAC: "fLaC"
  if (view[0] === 0x66 && view[1] === 0x4c && view[2] === 0x61 && view[3] === 0x43) return 'flac';

  // MP3: ID3 tag
  if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) return 'mp3';

  // MP3: raw sync word (no ID3)
  if (view[0] === 0xff && (view[1] & 0xe0) === 0xe0) return 'mp3';

  // AAC ADTS
  if (view[0] === 0xff && (view[1] & 0xf6) === 0xf0) return 'aac';

  // AIFF: "FORM....AIFF" or "AIFC"
  if (
    view[0] === 0x46 &&
    view[1] === 0x4f &&
    view[2] === 0x52 &&
    view[3] === 0x4d &&
    view[8] === 0x41 &&
    view[9] === 0x49
  )
    return 'aiff';

  // M4A/MP4: ftyp box at offset 4
  if (view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && view[7] === 0x70) return 'mp4';

  // WebM/MKV: EBML header
  if (view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3) return 'webm';

  return null; // unknown
}
```

---

## The tricky edge case: streaming chunks

The real problem is that **you might receive the format sniff bytes split across two chunks**. You need to buffer until you have enough bytes to be confident:

```js
const MIN_SNIFF_BYTES = 12;

class AudioStreamHandler {
  constructor(onFormat) {
    this._buffer = null;
    this._format = null;
    this._onFormat = onFormat; // callback when format is detected
    this._finder = null;
  }

  push(chunk) {
    if (this._format) {
      // Already detected — just find boundaries
      return this._finder.findBoundary(chunk);
    }

    // Accumulate until we have enough to sniff
    this._buffer = this._buffer ? concat(this._buffer, chunk) : chunk;

    if (this._buffer.byteLength < MIN_SNIFF_BYTES) {
      return null; // not enough data yet
    }

    this._format = detectAudioFormat(this._buffer);

    if (!this._format) {
      // Still unknown — fall back to PCM assumption
      // (most STT APIs send raw PCM if no container)
      this._format = 'pcm';
    }

    this._onFormat(this._format);
    this._finder = new AudioFrameBoundaryFinder(this._format);

    // Feed the accumulated buffer into the finder
    return this._finder.findBoundary(this._buffer);
  }
}
```

---

## The PCM fallback problem

The hardest case is **raw PCM with no header** — it has no magic bytes, so it's indistinguishable from random binary data. But for STT SDKs this is actually the most common case (browser mic → WebSocket). You can make an educated guess:

```js
function looksLikePCM(buffer) {
  // Raw PCM from a mic tends to have:
  // - Values clustered around zero (silence/speech have small amplitudes)
  // - No valid magic bytes from any known format
  const view = new Int16Array(buffer);
  let sum = 0;
  const samples = Math.min(view.length, 128);
  for (let i = 0; i < samples; i++) {
    sum += Math.abs(view[i]);
  }
  const avgAmplitude = sum / samples;
  // Mic audio rarely saturates — avg amplitude well below 32767
  return avgAmplitude < 20000;
}
```

This is heuristic and not foolproof, but in practice it works well since compressed formats would fail the magic byte check AND have high apparent "amplitude" in the raw bytes due to entropy.

---

## Putting it all together

```js
class SmartAudioStream {
  constructor({ onFormat, onBoundary, onChunk } = {}) {
    this._handler = new AudioStreamHandler((fmt) => {
      onFormat?.(fmt);
    });
    this._onBoundary = onBoundary;
    this._onChunk = onChunk;
  }

  push(chunk) {
    const boundary = this._handler.push(chunk);
    if (boundary !== null) {
      this._onBoundary?.(boundary);
      this._onChunk?.(chunk, boundary);
    }
  }

  get format() {
    return this._handler._format;
  }
}

// Usage
const stream = new SmartAudioStream({
  onFormat: (fmt) => console.log('Detected:', fmt),
  onBoundary: (b) => console.log('Frame boundary at byte:', b),
});

websocket.onmessage = (e) => stream.push(e.data);
```

---

## Confidence ranking for STT context

Since you're building an STT SDK, here's the practical reality of what you'll actually encounter and how detectable each is:

| Format   | Detectable? | Confidence     | Notes                                                 |
| -------- | ----------- | -------------- | ----------------------------------------------------- |
| Raw PCM  | ✗           | Heuristic only | Most common from browser mic                          |
| WAV      | ✓           | Very high      | RIFF+WAVE magic is unambiguous                        |
| OGG/Opus | ✓           | Very high      | OggS magic unambiguous                                |
| MP3      | ✓           | High           | ID3 tag makes it easy; raw sync is slightly ambiguous |
| AAC/ADTS | ✓           | Medium         | Sync word can false-positive in PCM data              |
| WebM     | ✓           | Very high      | EBML header unambiguous                               |

The safest real-world approach for an STT SDK is to **let the caller declare the format if they know it**, fall back to sniffing, and default to PCM if nothing matches — since that's what browsers produce natively via `AudioWorklet`.
