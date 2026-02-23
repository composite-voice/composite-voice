# Example 03 — Eager Pipeline

Demonstrates speculative LLM generation: the SDK starts generating a response before the user finishes speaking. The result is noticeably lower perceived latency.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — nova-3 or flux-general-en | WebSocket, real-time | All modern browsers |
| **LLM** | `AnthropicLLM` with `eagerLLM` | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz | All modern browsers |

---

## What you'll learn

- Where latency accumulates in the standard sequential STT → LLM → TTS pipeline
- What a `preflight` event is and how Deepgram v2 models emit it
- How `eagerLLM.enabled` uses the preflight signal to start LLM generation speculatively
- What `cancelOnTextChange` does and when it matters
- How to measure real pipeline timing using the SDK's event system

---

## What this adds over Example 01

The standard pipeline is strictly sequential — each step waits for the previous to complete:

```
Standard:   user stops → speech_final → LLM starts → first token → TTS begins
```

With Deepgram v2 models (like `flux-general-en`), the SDK overlaps the first two steps. Deepgram fires a `preflight` event slightly before `speech_final` — an early prediction of what the user said. The SDK uses it to start the LLM speculatively:

```
Eager:    preflight fires → LLM starts (speculative)
                            speech_final arrives
                                   ↓
                      text unchanged? → LLM continues uninterrupted
                      text changed?   → LLM cancelled, restarts correctly
```

By the time `speech_final` confirms the transcript, the LLM may already have tokens ready — TTS starts sooner, and the user hears a response faster.

Enable it with two config options:

```javascript
const agent = new CompositeVoice({
  stt, llm, tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true, // restart if the preflight text was wrong
  },
});
```

The UI visualizes all pipeline stages in real time — you can see exactly when each event fires and compare timing with and without eager mode enabled.

> **Note on model availability:** Preflight events require a Deepgram v2 model such as `flux-general-en`. The example defaults to `nova-3` (no preflight) so you can see baseline timing first. To enable the eager path, change the model to `flux-general-en` in `index.html` if your Deepgram account has access.

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
cp examples/03-eager-pipeline/sample.env examples/03-eager-pipeline/.env
```

Open `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:03-eager-pipeline:dev
```

Open [http://localhost:3003](http://localhost:3003) in Chrome or Edge.

---

## Pipeline diagram

```
Microphone
    ↓
DeepgramSTT (nova-3 or flux-general-en, WebSocket)
    ├── [transcription.preflight] ──▶ LLM starts speculatively (if eagerLLM.enabled)
    └── [transcription.speechFinal] ─▶ LLM: text same? continue | different? cancel + restart
                                                  ↓
                                     DeepgramTTS (aura-2, WebSocket, 24 kHz)
                                                  ↓
                                               Speakers
```

### Events visualized in the UI

| Event | When it fires |
|-------|---------------|
| `transcription.interim` | Each partial transcript segment, word by word |
| `transcription.final` | Deepgram confirms a segment as final |
| `transcription.preflight` | Early end-of-turn prediction from Deepgram v2 |
| `transcription.speechFinal` | Deepgram confirms the full utterance has ended |
| `llm.start` | LLM generation begins (eagerly or after `speechFinal`) |
| `llm.chunk` | Each token as it streams in |
| `llm.complete` | Full response assembled |
| `tts.start` | Deepgram TTS synthesis begins |
| `tts.complete` | Audio playback finished |

The UI timestamps each event so you can measure real latency with and without eager mode.

---

## Tuning the eager pipeline

### `cancelOnTextChange: true` (recommended)

When the `preflight` text differs from the final `speechFinal` text, the in-flight LLM generation is cancelled and restarted with the correct transcript. Prevents the AI from responding to a mishear.

### `cancelOnTextChange: false`

The LLM continues even if the transcript changed — faster (no restart overhead) but risks responding to incorrect text. Only suitable with highly accurate models and clean audio environments.

### Adjusting `endpointing`

```javascript
new DeepgramSTT({
  options: {
    endpointing: 300,   // ms of silence before speech_final fires
  }
})
```

Lower values feel more responsive; higher values prevent splitting long utterances.

---

## Troubleshooting

**No `preflight` events in the UI**

Preflight requires a Deepgram v2 model. The example defaults to `nova-3`. To enable preflight:

1. Open `index.html`
2. Change `model: 'nova-3'` to `model: 'flux-general-en'`
3. Verify your Deepgram account has access to v2 models at [console.deepgram.com](https://console.deepgram.com/)

**LLM restarts too frequently**

With `cancelOnTextChange: true`, the LLM restarts whenever the final transcript differs from the preflight. If this is happening often:

- Speak clearly with natural pauses
- Use `flux-general-en` for more accurate preflight predictions
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
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys completely out of the browser bundle |

---

## Browser support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome / Edge | Recommended | WebSocket and AudioWorklet fully supported |
| Firefox | Works | Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited | WebSocket AudioWorklet support varies by Safari version |
