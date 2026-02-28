# Example 21 — Eager Pipeline

Demonstrates speculative LLM generation: the SDK starts generating a response before the user finishes speaking. The result is noticeably lower perceived latency — 100-300ms saved per turn.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **Input** | `MicrophoneInput` | MediaStream API | All modern browsers |
| **STT** | `DeepgramFlux` — flux-general-en | WebSocket (V2 API), real-time | All modern browsers |
| **LLM** | `AnthropicLLM` with `eagerLLM` | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz | All modern browsers |
| **Output** | `BrowserAudioOutput` | Web Audio API | All modern browsers |

---

## What you'll learn

- Where latency accumulates in the standard sequential STT → LLM → TTS pipeline
- What a `preflight` event is and how `DeepgramFlux` emits it via Deepgram's V2 API
- How `eagerLLM.enabled` uses the preflight signal to start LLM generation speculatively
- What `cancelOnTextChange` and `similarityThreshold` do and when they matter
- How to measure real pipeline timing using the SDK's event system

---

## What this adds over Example 20

The standard pipeline (Example 20, using `DeepgramSTT`) is strictly sequential — each step waits for the previous to complete:

```
Standard:   user stops → speech_final → LLM starts → first token → TTS begins
```

This example uses `DeepgramFlux` — a separate provider that connects to Deepgram's V2 API. DeepgramFlux emits a `preflight` event (via `EagerEndOfTurn` signals) slightly before `speech_final` — an early prediction of what the user said. The SDK uses it to start the LLM speculatively:

```
Eager:    preflight fires → LLM starts (speculative)
                            speech_final arrives
                                   ↓
                      text similar? → LLM continues uninterrupted
                      text changed? → LLM cancelled, restarts correctly
```

By the time `speech_final` confirms the transcript, the LLM may already have tokens ready — TTS starts sooner, and the user hears a response faster.

Enable it with three config options:

```javascript
import { CompositeVoice, DeepgramFlux, AnthropicLLM, DeepgramTTS, MicrophoneInput, BrowserAudioOutput } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramFlux({
      proxyUrl: '/api/proxy/deepgram',
      options: {
        model: 'flux-general-en',
        eagerEotThreshold: 0.5,  // fire preflight at 50% end-of-turn confidence
        eotThreshold: 0.7,       // fire speechFinal at 70% confidence
      },
    }),
    llm, tts,
    new BrowserAudioOutput(),
  ],
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,      // restart if the preflight text was wrong
    similarityThreshold: 0.8,      // accept if >=80% word overlap
  },
});
```

The UI visualizes all pipeline stages in real time — you can see exactly when each event fires and measure the latency savings.

> **Important:** The eager pipeline requires `DeepgramFlux` — it is the only STT provider that emits preflight signals. `DeepgramSTT` (V1/Nova) does not support preflight events. See [Example 20](../20-deepgram-pipeline/) for the standard pipeline with `DeepgramSTT`.

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- A [Deepgram API key](https://console.deepgram.com/) — free tier, no credit card required
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/21-eager-pipeline/sample.env examples/21-eager-pipeline/.env
```

Open `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:21-eager-pipeline:dev
```

Open [http://localhost:3021](http://localhost:3021) in Chrome or Edge.

---

## Pipeline diagram

```
Microphone
    ↓
DeepgramFlux (flux-general-en, V2 WebSocket)
    ├── [transcription.preflight] ──▶ LLM starts speculatively (eagerLLM.enabled)
    └── [transcription.speechFinal] ─▶ text similar? continue | different? cancel + restart
                                                  ↓
                                     DeepgramTTS (aura-2, WebSocket, 24 kHz)
                                                  ↓
                                               Speakers
```

### Events visualized in the UI

| Event | When it fires |
|-------|---------------|
| `transcription.interim` | Each partial transcript update as the user speaks |
| `transcription.preflight` | Early end-of-turn prediction from DeepgramFlux — triggers eager LLM |
| `transcription.speechFinal` | DeepgramFlux confirms the full utterance has ended |
| `llm.start` | LLM generation begins (eagerly from preflight, or after `speechFinal`) |
| `llm.chunk` | Each token as it streams in |
| `llm.complete` | Full response assembled |
| `tts.start` | Deepgram TTS synthesis begins |
| `tts.complete` | Audio playback finished |

The UI timestamps each event so you can measure real latency savings from the eager pipeline.

---

## Tuning the eager pipeline

### `cancelOnTextChange: true` (recommended)

When the `preflight` text differs from the final `speechFinal` text beyond the `similarityThreshold`, the in-flight LLM generation is cancelled and restarted with the correct transcript. Prevents the AI from responding to a mishear.

### `similarityThreshold: 0.8` (default)

Controls how different the preflight and final transcripts can be before cancelling. The SDK uses an order-aware word-overlap score from 0 to 1. At `0.8`, the preflight must match 80% of the final words to be accepted.

### `cancelOnTextChange: false`

The LLM continues even if the transcript changed — faster (no restart overhead) but risks responding to incorrect text. Only suitable with highly accurate models and clean audio environments.

### Adjusting end-of-turn thresholds

```javascript
new DeepgramFlux({
  options: {
    eagerEotThreshold: 0.5,  // lower = more frequent preflights, higher = more conservative
    eotThreshold: 0.7,       // controls when speechFinal fires
  },
})
```

Lower `eagerEotThreshold` values fire preflights more aggressively (more speculative but potentially more restarts). Higher values wait longer, reducing restarts but also reducing the latency benefit.

---

## Troubleshooting

**No `preflight` events in the UI**

- Confirm you are using `DeepgramFlux` (not `DeepgramSTT`) — only DeepgramFlux emits preflight signals
- Verify your Deepgram account has access to V2 Flux models at [console.deepgram.com](https://console.deepgram.com/)
- Check the browser console for WebSocket connection errors

**LLM restarts too frequently**

With `cancelOnTextChange: true`, the LLM restarts whenever the final transcript differs significantly from the preflight. If this is happening often:

- Speak clearly with natural pauses
- Raise `similarityThreshold` (e.g., `0.9`) to tolerate more minor differences
- Set `cancelOnTextChange: false` if minor text differences are acceptable

**WebSocket connection fails**

- Verify both API keys in your `.env` file
- Check that your network allows outbound WebSocket connections to Deepgram

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [10 — Proxy Server](../10-proxy-server/) | Keep API keys completely out of the browser bundle |

---

## Browser support

DeepgramFlux and DeepgramTTS use WebSocket connections — they do not depend on the Web Speech API. Audio capture uses the MediaStream API (microphone) and audio playback uses the Web Audio API (AudioWorklet).

| Browser | Microphone capture | Audio playback | Notes |
|---------|-------------------|----------------|-------|
| Chrome / Edge | Full support | Full support (AudioWorklet) | Recommended |
| Firefox | Full support | Full support (AudioWorklet) | Works — no Web Speech API needed |
| Safari | Full support | Varies by version | AudioWorklet support depends on Safari version |
