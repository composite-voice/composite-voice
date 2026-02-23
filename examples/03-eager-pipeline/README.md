# Example 03 — Eager Pipeline

Demonstrates the speculative LLM pipeline: the SDK starts generating a response *before* the user has finished speaking, using Deepgram's early end-of-turn "preflight" signal. The result is noticeably lower perceived latency.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 (or flux-general-en for preflight) | WebSocket, real-time |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 with eager mode | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

---

## How the eager pipeline works

The standard pipeline is strictly sequential:

```
speech_final → LLM start → first token → TTS start
```

With eager mode enabled, Deepgram v2 models fire a `preflight` event slightly *before* `speech_final`. This is an early prediction of what the final transcript will be. The SDK uses it to start the LLM ahead of time:

```
preflight (early prediction) → LLM start
speech_final arrives ─────────────────────┐
                                          ↓
                     text unchanged? → LLM keeps streaming
                     text changed?  → LLM cancelled, restarts
```

Enable it with `eagerLLM.enabled: true`:

```js
agent = new CompositeVoice({
  stt, llm, tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,   // restart if preflight text differs from speech_final
  },
});
```

The UI in this example visualises all three pipeline stages in real time — you can see exactly when preflight fires, when `speech_final` arrives, when the first LLM token lands, and when TTS starts.

> **Note:** Preflight events require a Deepgram v2 model such as `flux-general-en`. The example defaults to `nova-3` (which does not emit preflight) so you can see the baseline. To enable the eager path, change the model in `index.html` if your Deepgram account has access to a v2 model.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge
- A [Deepgram API key](https://console.deepgram.com/) — free tier available
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Create your env file
cp examples/03-eager-pipeline/sample.env examples/03-eager-pipeline/.env
```

Edit `examples/03-eager-pipeline/.env`:

```env
VITE_DEEPGRAM_API_KEY=your-deepgram-api-key-here
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

---

## Run

```bash
pnpm example:03-eager-pipeline:dev
```

Open [http://localhost:3003](http://localhost:3003) in Chrome or Edge.

---

## Architecture

```
Microphone → DeepgramSTT (nova-3, WS) ──┬──[preflight]────▶ LLM (speculative start)
                                         └──[speech_final]──▶ LLM (confirmed / cancel & restart)
                                                                        ↓
                                                          DeepgramTTS (aura-2, WS) → Speakers
```

---

## Events exposed in this example

| Event | When fired |
|-------|-----------|
| `transcription.preflight` | Early end-of-turn prediction from Deepgram v2 |
| `transcription.speechFinal` | Deepgram confirms end of utterance |
| `transcription.interim` | Partial transcript segment (word-by-word) |
| `transcription.final` | Confirmed transcript segment |
| `llm.start` | LLM generation begins |
| `llm.chunk` | Token received |
| `llm.complete` | Full response assembled |
| `tts.start` | TTS synthesis begins |
| `tts.complete` | Playback finished |

---

## Troubleshooting

**I'm not seeing any preflight events**

Preflight requires a Deepgram v2 model (`flux-general-en` or similar). The example defaults to `nova-3` which does not emit preflight. Update the model in `index.html`.

**LLM restarts frequently**

When `cancelOnTextChange: true`, the LLM restarts if `speech_final` text differs from the `preflight` text. Try speaking more clearly or using a model with better end-of-turn detection.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[04 — Server-side proxy](../04-proxy-server/)** | Keep API keys completely out of the browser |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support (recommended) |
| Firefox | Works; Web Audio API behaviour may differ slightly |
| Safari | Limited — WebSocket-based AudioWorklet support is restricted |
