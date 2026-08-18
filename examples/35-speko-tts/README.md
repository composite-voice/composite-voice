# Example 35 — Speko TTS

Text-to-speech through the Speko Relay voice-model router. Speko benchmarks upstream TTS providers in real time and routes each synthesis request to the best one for your objective — lowest latency, highest quality, lowest cost, or a balance. Switch to explicit mode to pin an exact provider, model, and voice.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) — Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `SpekoTTS` | Speko Relay routed TTS via HTTP proxy |

## What you'll learn

- How to configure `SpekoTTS` with a `routing` object: auto mode with an `objective`, or explicit provider/model pinning with an optional voice ID
- How the provider satisfies Speko's `Idempotency-Key` requirement automatically (a fresh UUID per request)
- How raw `pcm_s16le` relay output is wrapped in a WAV header so the browser can decode and play it
- How the Vite dev proxy injects the API key server-side (see `_shared/vite.config.factory.ts`)

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/35-speko-tts/sample.env .env
# Edit .env and add your SPEKO_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example composite-voice-example-35-speko-tts dev
```

Open [http://localhost:3035](http://localhost:3035) in Chrome or Edge (NativeSTT requires the Web Speech API).

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `routing` | relay default (`auto`/`balanced`) | `{ mode: 'auto', objective }` or `{ mode: 'explicit', provider, model }` |
| `voice` | route default | Provider voice ID (only meaningful with explicit routing) |
| `encoding` | `'pcm_s16le'` | Output encoding (`pcm_s16le` or `opus`) |
| `sampleRate` | `24000` | Output sample rate in Hz (8000–192000) |
| `channels` | `1` | Output channel count (1–8) |

The relay's TTS endpoints are currently English-only, and billing is per character accepted for synthesis.

## What to try next

| Example | What it adds |
|---------|-------------|
| [15 — Speko STT](../15-speko-stt/) | The companion routed streaming STT provider |
| [34 — Cartesia TTS](../34-cartesia-tts/) | A single-vendor streaming TTS provider |
| [42 — Node proxy](../42-node-proxy/) | Production server-side proxy setup |
