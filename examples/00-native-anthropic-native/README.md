# Example 00 — Simplest Voice Agent

The absolute minimum to get a voice agent running: browser-native speech recognition, Anthropic for intelligence, and browser-native speech synthesis. **No Deepgram account needed** — just one API key.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API (Chrome/Edge built-in) | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API (browser built-in) | Free |

Start here, then work through the other examples as your needs grow.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge (Web Speech API is not available in Firefox or Safari)
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
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
```

Edit `examples/00-native-anthropic-native/.env`:

```env
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

---

## Run

```bash
pnpm example:00-native-anthropic-native:dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge.

---

## How it works

```
Microphone → NativeSTT (Web Speech API) → AnthropicLLM (haiku) → NativeTTS (SpeechSynthesis) → Speakers
```

1. Click **Initialize** — creates all three providers and wires them into `CompositeVoice`
2. Click **Start Listening** — requests microphone access and opens the Web Speech recognition stream
3. **Speak** — interim results appear in italics as you talk; the final transcript shows when you pause
4. **AI response** — the transcript is sent to `claude-haiku-4-6`; response text streams back token by token
5. **TTS playback** — once the LLM finishes, the browser reads the response aloud via `SpeechSynthesisUtterance`
6. **Loop** — the agent returns to listening automatically
7. **Stop / Dispose** — pause listening, or tear everything down cleanly

`NativeSTT` and `NativeTTS` both set `managedAudio = true`, which means they control their own audio pipelines directly — the SDK's `AudioContext` layer is bypassed for these providers.

---

## Troubleshooting

**"Microphone permission denied"**

Click the lock icon in the browser address bar and allow microphone access, then reload.

**No speech recognition / nothing happening when I speak**

- Make sure you're in Chrome or Edge — Firefox and Safari don't support the Web Speech API
- Check that your microphone is working in other apps
- Try speaking clearly and pausing between sentences

**"VITE_ANTHROPIC_API_KEY is not set"**

You haven't created the `.env` file yet. Copy `sample.env` and add your key:

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
```

**"Cannot find module '@lukeocodes/composite-voice'"**

The SDK needs to be built first:

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[01 — Deepgram + Anthropic](../01-deepgram-anthropic-deepgram/)** | Real WebSocket STT and streaming TTS at 24 kHz |
| **[02 — Conversation history](../02-conversation-history/)** | Multi-turn memory so the AI remembers earlier exchanges |
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Speculative LLM start for lower perceived latency |
| **[04 — Server-side proxy](../04-proxy-server/)** | API keys server-side only — nothing in the browser bundle |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support (recommended) |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API implementation is limited |
