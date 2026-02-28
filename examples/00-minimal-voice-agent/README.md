# Example 00 — Minimal Voice Agent

The minimum viable voice agent. Browser speech recognition, Claude, and browser speech synthesis — no WebSockets, no extra accounts, just one API key and you're talking to an AI.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built into the browser) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free, built into the browser) | All modern browsers |

---

## What you'll learn

- How to wire `CompositeVoice` with three providers in a handful of lines
- The `idle → ready → listening → thinking → speaking` state machine
- How to subscribe to events: `agent.stateChange`, `transcription.interim`, `transcription.final`, `llm.chunk`
- Why `NativeSTT` and `NativeTTS` require no API key — and the browser-support trade-off
- How to display streaming LLM tokens as they arrive in real time

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- **Chrome or Edge** — the Web Speech API is not available in Firefox, Safari, or de-Googled browsers (Ungoogled Chromium, Brave)
- An [Anthropic API key](https://console.anthropic.com/) — free to create, pay per token

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/00-minimal-voice-agent/sample.env examples/00-minimal-voice-agent/.env
```

Open `.env` and fill in your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:00-minimal-voice-agent:dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome or Edge**.

1. Click **Initialize** — connects providers and requests microphone permission
2. Click **Start** — the agent begins listening
3. Speak — your words appear in "You said" as you talk, Claude's response streams into "AI response"
4. Click **Stop** when done

---

## How it works

```
Microphone
    ↓
NativeSTT  (Web Speech API)
    ↓  transcription.speechFinal — fires when you finish speaking
AnthropicLLM  (claude-haiku-4-5-20251001, HTTP streaming)
    ↓  llm.chunk — one token at a time
NativeTTS  (SpeechSynthesis API)
    ↓
Speakers
    ↓  returns to listening automatically
```

### The core code

Three providers, zero client-side keys. The Vite dev server proxies API requests so your key never reaches the browser.

```javascript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({
      language: 'en-US',
      continuous: true,     // keep listening between pauses
      interimResults: true, // stream partial words while speaking
    }),
    new AnthropicLLM({
      proxyUrl: `${window.location.origin}/proxy/anthropic`,
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
      maxTokens: 200,
    }),
    new NativeTTS({
      rate: 1.0,
      preferLocal: true,
    }),
  ],
});

// Subscribe to events
agent.on('agent.stateChange',   (e) => console.log('State:', e.state));
agent.on('transcription.final', (e) => console.log('You said:', e.text));
agent.on('llm.chunk',           (e) => process.stdout.write(e.chunk));

// Start
await agent.initialize();
await agent.startListening();
```

---

## Provider options

### NativeSTT

| Option | Default | Description |
|--------|---------|-------------|
| `language` | `'en-US'` | BCP-47 language tag — e.g. `'fr-FR'`, `'es-ES'`, `'de-DE'` |
| `continuous` | `true` | Keep listening between pauses — `false` stops after the first response |
| `interimResults` | `true` | Emit partial transcripts word-by-word while speaking |
| `startTimeout` | `5000` | Milliseconds before erroring if the browser doesn't confirm recognition started |

### AnthropicLLM

| Option | Default | Description |
|--------|---------|-------------|
| `model` | required | Anthropic model ID — `claude-haiku-4-5-20251001` is fast and cost-effective |
| `systemPrompt` | — | Sets the AI's persona and response style |
| `maxTokens` | `200` | Maximum response length in tokens |
| `temperature` | `0.7` | Randomness: `0` = deterministic, `1` = more creative |
| `stream` | `true` | Stream tokens as they arrive — `false` for a single batch response |

### NativeTTS

| Option | Default | Description |
|--------|---------|-------------|
| `rate` | `1.0` | Speech rate (0.1 – 10) |
| `pitch` | `1.0` | Voice pitch (0 – 2) |
| `volume` | `1.0` | Playback volume (0 – 1) |
| `preferLocal` | `true` | Prefer on-device voices over cloud-backed voices |

---

## Troubleshooting

**"Missing API key" error on the page**

```bash
cp examples/00-minimal-voice-agent/sample.env examples/00-minimal-voice-agent/.env
# Open .env and paste your key after ANTHROPIC_API_KEY=
```

**"Cannot find module '@lukeocodes/composite-voice'"**

The SDK must be built before examples can import it:

```bash
pnpm build
```

**Nothing happens when I speak**

- Make sure you're using Chrome or Edge — Firefox, Safari, Ungoogled Chromium, and Brave don't support the Web Speech API (it requires Google's speech servers)
- Click **Initialize** first, then **Start** — these are two separate steps
- Check your microphone works in another app
- Click anywhere on the page before speaking — browsers require a user gesture before granting mic access

**The AI voice sounds robotic**

Try a slightly slower rate and ensure `preferLocal: true` is set. On macOS, voices marked **(Enhanced)** or **(Premium)** in System Settings → Accessibility → Spoken Content sound significantly better.

```javascript
new NativeTTS({ rate: 0.9, preferLocal: true })
```

**Speech recognition stops mid-session**

With `continuous: true`, the SDK reconnects automatically when the browser ends a recognition session internally. If this is happening frequently, check the browser console for Web Speech API errors.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | WebSocket STT/TTS — better accuracy, Firefox support |
| [01 — Conversation history](../01-conversation-history/) | Multi-turn memory so the AI remembers earlier exchanges |
| [21 — Eager pipeline](../21-eager-pipeline/) | Lower latency with speculative LLM generation |
| [10 — Server-side proxy](../10-proxy-server/) | Keep API keys server-side — nothing exposed in the browser |

---

## Browser support

NativeSTT and NativeTTS use the browser's Web Speech API. Microphone capture is handled directly by the browser — no AudioWorklet needed.

| Browser | Web Speech API (STT) | SpeechSynthesis (TTS) | Notes |
|---------|---------------------|----------------------|-------|
| Chrome / Edge | Full support | Full support | Recommended |
| Ungoogled Chromium | Not available | Full support | See note below |
| Brave | Not available | Full support | See note below |
| Firefox | Not available | Limited | Use WebSocket providers (DeepgramSTT / DeepgramFlux) instead |
| Safari | Unreliable | Works | Behaviour varies by version — use WebSocket providers instead |

> **De-Googled browsers:** The Web Speech API in Chromium-based browsers sends audio to Google's speech recognition servers. Privacy-focused forks like **Ungoogled Chromium** and **Brave** strip out Google services, so `SpeechRecognition` will silently fail or not exist at all. NativeTTS (SpeechSynthesis) still works fine since it runs locally. If you use one of these browsers, switch to a WebSocket-based STT provider like [DeepgramSTT](../20-deepgram-pipeline/), [AssemblyAISTT](../40-assemblyai-pipeline/), or [ElevenLabsSTT](../81-elevenlabs-stt/).
