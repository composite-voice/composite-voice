# Example 01 — Deepgram + Anthropic + Deepgram

Best-in-class voice agent using Deepgram's real-time WebSocket speech models with Anthropic's fastest Claude model.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

This is the recommended production configuration. All three providers stream in real time — the transcript appears as you speak, and audio playback starts within a second of you finishing your sentence.

---

## Prerequisites

- Node.js 18+
- pnpm
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
cp examples/01-deepgram-anthropic-deepgram/sample.env examples/01-deepgram-anthropic-deepgram/.env
```

Edit `examples/01-deepgram-anthropic-deepgram/.env`:

```env
VITE_DEEPGRAM_API_KEY=your-deepgram-api-key-here
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

---

## Run

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev
```

Open [http://localhost:3001](http://localhost:3001) in Chrome or Edge.

---

## How it works

```
Microphone → DeepgramSTT (nova-3, WS) → AnthropicLLM (haiku, HTTP) → DeepgramTTS (aura-2, WS) → Speakers
```

1. Click **Initialize** — connects all three providers via WebSocket and HTTP
2. Click **Start Listening** — opens your microphone and begins real-time transcription
3. **Speak** — Deepgram nova-3 streams the transcript word-by-word as you talk
4. **Pause** — Deepgram fires a `speech_final` event; the utterance is sent to the LLM
5. **LLM response** — claude-haiku-4-6 streams the response back token by token
6. **TTS playback** — Deepgram aura-2 synthesizes the response and plays it through your speakers
7. **Loop** — once playback finishes, the agent returns to listening

The `auto` turn-taking strategy is in effect: the microphone is not paused during TTS playback because Deepgram's echo cancellation prevents feedback.

---

## Troubleshooting

**WebSocket connection fails**

- Verify your Deepgram API key is correct
- Check the browser console for the specific error message
- Deepgram requires a network connection — a VPN may interfere

**No audio playback**

- Make sure your system audio is not muted
- Check that the browser has permission to play audio
- Try a different voice model in the `DeepgramTTS` config

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[02 — Conversation history](../02-conversation-history/)** | Multi-turn memory |
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Lower latency with Deepgram v2 preflight signals |
| **[04 — Server-side proxy](../04-proxy-server/)** | Keep API keys out of the browser entirely |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support (recommended) |
| Firefox | Works; Web Audio API behaviour may differ slightly |
| Safari | Limited — WebSocket-based AudioWorklet support is restricted |
