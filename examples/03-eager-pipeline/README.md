# Example 03 — Eager Pipeline

Demonstrates the speculative LLM pipeline: the SDK starts generating a response *before* the user finishes speaking, using Deepgram's early end-of-turn "preflight" signal. The result is noticeably lower perceived latency.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 (or `flux-general-en` for preflight) | WebSocket, real-time |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 with eager mode | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

---

## What you'll learn

- How the standard sequential pipeline works and where latency accumulates
- What a `preflight` event is and how Deepgram v2 models emit it
- How `eagerLLM.enabled` uses the preflight signal to start LLM generation speculatively
- What `cancelOnTextChange` does and when to use it
- How to measure pipeline timing in real time using the SDK's event system

---

## How the eager pipeline works

The standard voice pipeline is strictly sequential:

```
User stops speaking  →  speech_final fires  →  LLM starts  →  first token  →  TTS begins
```

Every step waits for the previous one to complete. The gap between "user stops speaking" and "TTS begins" is where latency accumulates.

With Deepgram v2 models (e.g. `flux-general-en`), the SDK can overlap the first two steps. The v2 model fires a `preflight` event slightly *before* `speech_final` — an early prediction of what the final transcript will be. The SDK uses it to start LLM generation ahead of time:

```
preflight fires  →  LLM starts (speculative)
              speech_final arrives
                       ↓
          text unchanged?  →  LLM continues uninterrupted
          text changed?    →  LLM cancelled, restarts with correct text
```

By the time `speech_final` confirms the transcript, the LLM may already have a few tokens ready. TTS starts sooner and the user hears a response faster.

Enable it with two config options:

```javascript
const agent = new CompositeVoice({
  stt, llm, tts,
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,  // abort and restart if the preflight text was wrong
  },
});
```

The UI in this example visualizes all pipeline stages in real time — you can see exactly when each event fires and compare timing.

> **Note on model availability:** Preflight events require a Deepgram v2 model such as `flux-general-en`. This example defaults to `nova-3` (which does not emit preflight) so you can see the baseline timing first. To enable the eager path, change the model to `flux-general-en` in `index.html` if your Deepgram account has access.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge (recommended; Firefox works for Deepgram providers)
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

# 3. Copy the sample env file and fill in your keys
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
Microphone
    ↓
DeepgramSTT (nova-3 or flux-general-en, WebSocket)
    ├──[transcription.preflight]──▶ LLM starts (speculative, if eagerLLM.enabled)
    └──[transcription.speechFinal]─▶ LLM: text same? continue | different? cancel + restart
                                                   ↓
                                      DeepgramTTS (aura-2, WebSocket, 24 kHz)
                                                   ↓
                                                Speakers
```

### Events visualized in the UI

| Event | When it fires |
|-------|---------------|
| `transcription.interim` | Each partial transcript segment (word-by-word) |
| `transcription.final` | Deepgram confirms a segment as final |
| `transcription.preflight` | Early end-of-turn prediction from Deepgram v2 |
| `transcription.speechFinal` | Deepgram confirms the full utterance has ended |
| `llm.start` | LLM generation begins (eagerly or after `speech_final`) |
| `llm.chunk` | Each token as it arrives |
| `llm.complete` | Full response assembled |
| `tts.start` | Deepgram TTS synthesis begins |
| `tts.complete` | Audio playback finished |

The UI timestamps each event so you can measure the actual latency difference with and without eager mode.

---

## Tuning the eager pipeline

### `cancelOnTextChange: true` (recommended)

When the `preflight` text differs from the final `speech_final` text, the in-flight LLM generation is cancelled and restarted with the correct transcript. This prevents the AI from responding to a misheard utterance at the cost of an occasional restart.

### `cancelOnTextChange: false`

The LLM continues even if the transcript changed. This is faster — no restart overhead — but risks the AI responding to an incorrect transcript. Only use this with highly accurate models and clear audio conditions.

### `endpointing` value

```javascript
new DeepgramSTT({
  options: {
    endpointing: 300,  // default — waits 300 ms of silence before speech_final
  }
})
```

Lower values feel more responsive but may split long utterances into multiple turns. Higher values wait longer but feel more natural for complex questions.

---

## Troubleshooting

**I'm not seeing any `preflight` events in the UI**

Preflight requires a Deepgram v2 model. The example defaults to `nova-3` which does not emit preflight events. To enable preflight:
1. Open `index.html`
2. Change `model: 'nova-3'` to `model: 'flux-general-en'`
3. Ensure your Deepgram account has access to v2 models

**The LLM restarts frequently**

When `cancelOnTextChange: true`, the LLM restarts whenever `speech_final` text differs from `preflight` text. If this happens often:
- Speak more clearly with distinct pauses between thoughts
- Use `flux-general-en` for more accurate preflight predictions
- Set `cancelOnTextChange: false` to accept minor text differences

**WebSocket connection fails**

- Verify both API keys are correct in your `.env` file
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

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram providers don't require Web Speech API |
| Safari | Limited — WebSocket AudioWorklet support varies by Safari version |
