# Example 81 — ElevenLabs STT

Real-time speech-to-text using ElevenLabs Scribe V2 via a server-side proxy. This example demonstrates the `ElevenLabsSTT` provider in isolation — no LLM or TTS, just transcription.

| | Provider | Via |
|-|----------|-----|
| **STT** | `ElevenLabsSTT` — scribe_v2_realtime | `proxyUrl` (no API key in browser) |

---

## What you'll learn

- How to use `ElevenLabsSTT` as a standalone provider (without `CompositeVoice`)
- How proxy mode keeps your ElevenLabs API key server-side only
- How interim and final transcription results differ
- How to capture microphone audio and stream PCM chunks to the provider
- How the Express adapter (`server.ts`) works for production deployments

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- An [ElevenLabs API key](https://elevenlabs.io/) with Scribe V2 access

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/81-elevenlabs-stt/sample.env examples/81-elevenlabs-stt/.env
```

Open `.env` and fill in your key:

```env
ELEVENLABS_API_KEY=your-elevenlabs-key-here
```

> **Important:** The env var does **not** use the `VITE_` prefix. Any variable prefixed with `VITE_` is automatically bundled into the browser build by Vite — exactly what we're avoiding here.

---

## Run (development)

```bash
pnpm --filter @lukeocodes/composite-voice-example-81-elevenlabs-stt dev
```

Open [http://localhost:3081](http://localhost:3081).

Click **Initialize**, then **Start Listening** and speak into your microphone. You'll see:

- **Interim results** — grey italic text that updates as you speak
- **Final results** — bold text with a confidence percentage after each pause

---

## Run (production)

Build the front end, then start the Express server:

```bash
# 1. Build the browser app
pnpm --filter @lukeocodes/composite-voice-example-81-elevenlabs-stt build

# 2. Start the Express proxy server
cd examples/81-elevenlabs-stt
npx tsx server.ts
```

---

## How it works

### Development

```
Browser ──[no keys]──▶ Vite dev server ──[xi-api-key injected]──▶ wss://api.elevenlabs.io
```

### Production

```
Browser ──[no keys]──▶ /proxy/elevenlabs ──[xi-api-key injected]──▶ wss://api.elevenlabs.io
```

### Key code

```javascript
import { ElevenLabsSTT } from '@lukeocodes/composite-voice';

const stt = new ElevenLabsSTT({
  proxyUrl: `${window.location.origin}/proxy/elevenlabs`,
  model: 'scribe_v2_realtime',
  audioFormat: 'pcm_16000',
  language: 'en',
  commitStrategy: 'vad',
  includeTimestamps: true,
});

stt.on('transcription', (result) => {
  if (result.isFinal) {
    console.log('Final:', result.text, result.confidence);
  } else {
    console.log('Interim:', result.text);
  }
});

await stt.initialize();
await stt.connect();

// Stream audio chunks from getUserMedia
stt.sendAudio(pcmArrayBuffer);
```

---

## Configuration options

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'scribe_v2_realtime'` | ElevenLabs transcription model |
| `audioFormat` | `'pcm_16000'` | Audio encoding and sample rate |
| `language` | auto-detect | BCP 47 or ISO 639 code (e.g. `'en'`, `'fr'`, `'de'`) |
| `commitStrategy` | `'vad'` | `'vad'` (automatic) or `'manual'` (call `sendCommit()`) |
| `includeTimestamps` | `false` | Include word-level timestamps in results |
| `includeLanguageDetection` | `false` | Return detected language in metadata |

---

## Troubleshooting

**WebSocket connection fails**

- Check that `ELEVENLABS_API_KEY` is set in `.env` (not `.env.local`, not `VITE_` prefixed)
- Verify the key has Scribe V2 access on the ElevenLabs dashboard

**No audio captured**

- Allow microphone access when the browser prompts
- Check DevTools console for `getUserMedia` errors

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```
