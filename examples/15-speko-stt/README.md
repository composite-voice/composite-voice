# Example 15 — Speko STT

Real-time transcription through the Speko Relay voice-model router. Speko benchmarks upstream STT providers in real time and routes each WebSocket session to the best one for your objective — lowest latency, highest quality, lowest cost, or a balance — with automatic failover. Switch to explicit mode to pin an exact provider and model.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `SpekoSTT` | Speko Relay routed STT via WebSocket proxy |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free) |

## What you'll learn

- How to configure `SpekoSTT` with a `routing` object: auto mode with an `objective`, or explicit provider/model pinning
- Why Speko's WebSocket API requires a proxy **in browsers** — the relay authenticates upgrades with `Authorization` and `Idempotency-Key` headers, which browsers cannot set on a WebSocket handshake (server-side Node pipelines skip the proxy and pass `apiKey` directly)
- How the Vite dev proxy injects the API key and a fresh `Idempotency-Key` per connection (see `_shared/vite.config.factory.ts`)
- How `transcript.delta` (interim) and `transcript.final` (utterance-complete) frames map to pipeline results

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/15-speko-stt/sample.env .env
# Edit .env and add your SPEKO_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example composite-voice-example-15-speko-stt dev
```

Open [http://localhost:3015](http://localhost:3015) in any modern browser.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `routing` | relay default (`auto`/`balanced`) | `{ mode: 'auto', objective }` or `{ mode: 'explicit', provider, model }` |
| `sampleRate` | `16000` | Microphone audio sample rate in Hz (8000–192000) |
| `audioFormat` | `'pcm_s16le'` | Input encoding (`pcm_s16le` or `opus`) |
| `language` | `'en'` | ISO 639-1 code (the relay is currently English-only) |
| `interimResults` | `true` | Emit interim results from `transcript.delta` frames |

## Browser Support

SpekoSTT works in all modern browsers including Firefox and Safari — but in browsers only through a proxy, which this example's Vite dev server provides. In production browser deployments, use the CompositeVoice server proxy with `spekoApiKey` configured. Server-side Node pipelines (phone agents, meeting bots) connect directly with `apiKey` instead — no proxy needed.

## What to try next

| Example | What it adds |
|---------|-------------|
| [11 — Deepgram STT](../11-deepgram-stt/) | A single-vendor streaming STT provider |
| [35 — Speko TTS](../35-speko-tts/) | The companion routed TTS provider |
| [42 — Node proxy](../42-node-proxy/) | Production server-side proxy setup |
