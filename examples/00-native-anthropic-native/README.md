# Example 00 — Simplest Voice Agent

The minimum viable voice agent: browser-native STT, Anthropic for the intelligence, browser-native TTS. One API key. No WebSockets. **Start here.**

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API | Free (browser built-in) |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Free (browser built-in) |

---

## What you'll learn

- How to initialize `CompositeVoice` with three providers
- How to subscribe to events: `transcription.interim`, `transcription.final`, `llm.chunk`, `agent.stateChange`
- How the agent state machine works: `idle → ready → listening → thinking → speaking`
- What `managedAudio = true` means (native providers manage their own audio pipelines through browser APIs directly)

---

## Prerequisites

- Node.js 18+
- pnpm
- **Chrome or Edge** — the Web Speech API is not supported in Firefox or Safari
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands from the **repo root**:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the SDK (examples resolve it from local dist/)
pnpm build

# 3. Copy the env template and add your key
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
```

Edit `.env`:

```env
VITE_ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

---

## Run

```bash
pnpm example:00-native-anthropic-native:dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome or Edge**.

---

## How it works

```
Microphone
    ↓
NativeSTT (Web Speech API)
    ↓  transcription.speechFinal  →  triggers LLM
AnthropicLLM (claude-haiku-4-6, HTTP streaming)
    ↓  llm.chunk  (token by token)
NativeTTS (SpeechSynthesis API)
    ↓
Speakers
    ↓  agent returns to listening automatically
```

### Core code

```javascript
const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
  llm: new AnthropicLLM({
    apiKey: ANTHROPIC_API_KEY,
    model: 'claude-haiku-4-6',
    systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
    maxTokens: 200,
  }),
  tts: new NativeTTS({ rate: 1.0, preferLocal: true }),
});

await agent.initialize();
await agent.startListening();
```

`NativeSTT` and `NativeTTS` set `managedAudio = true`, meaning they control their own audio pipelines through browser APIs — the SDK's `AudioContext` layer is bypassed for these providers.

---

## Configuration reference

### NativeSTT

| Option | Default | Description |
|--------|---------|-------------|
| `language` | `'en-US'` | BCP-47 language tag |
| `continuous` | `true` | Keep listening between pauses |
| `interimResults` | `true` | Emit partial transcripts while speaking |
| `startTimeout` | `5000` | ms to wait for the browser to confirm recognition started |

### AnthropicLLM

| Option | Default | Description |
|--------|---------|-------------|
| `model` | — | Any Anthropic model ID |
| `systemPrompt` | — | Sets the AI's persona and constraints |
| `maxTokens` | `200` | Maximum response length in tokens |
| `temperature` | `0.7` | Randomness (0 = deterministic, 1 = more creative) |
| `stream` | `true` | Stream tokens as they arrive |

### NativeTTS

| Option | Default | Description |
|--------|---------|-------------|
| `rate` | `1.0` | Speech rate (0.1–10) |
| `pitch` | `1.0` | Voice pitch (0–2) |
| `volume` | `1.0` | Playback volume (0–1) |
| `preferLocal` | `true` | Prefer on-device voices over cloud voices |

---

## Troubleshooting

**"VITE_ANTHROPIC_API_KEY is not set"**

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# Then edit .env and add your Anthropic API key
```

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

**Nothing happens when I speak**

- Confirm you're using Chrome or Edge — Firefox and Safari don't support the Web Speech API
- Check your microphone is working in another app
- Click anywhere on the page first — browsers require a user gesture before speech recognition can start

**The voice sounds robotic**

Try a slightly lower rate. On macOS, voices labelled **(Enhanced)** or **(Premium)** in System Settings → Accessibility → Spoken Content sound significantly better:

```javascript
new NativeTTS({ rate: 0.9, pitch: 1.0, preferLocal: true })
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [01 — Deepgram + Anthropic](../01-deepgram-anthropic-deepgram/) | Real-time WebSocket STT and TTS — better accuracy, works in Firefox |
| [02 — Conversation history](../02-conversation-history/) | Multi-turn memory so the AI remembers earlier exchanges |
| [03 — Eager pipeline](../03-eager-pipeline/) | Lower latency with speculative LLM generation |
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys server-side — nothing exposed in the browser |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API support is limited and inconsistent |
