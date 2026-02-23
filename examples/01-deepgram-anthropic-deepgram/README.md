# Example 01 — Deepgram + Anthropic + Deepgram

The production-ready pipeline: real-time WebSocket transcription, Claude, and 24 kHz streaming audio. Works in Firefox too.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time streaming | All modern browsers |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5-20251001 | HTTP streaming | All |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz audio | All modern browsers |

**Free tier available** — both Deepgram providers work on the free tier. No credit card required to get started.

---

## What you'll learn

- How `DeepgramSTT` streams transcript words in real time over WebSocket (vs. one event per utterance with `NativeSTT`)
- The difference between `transcription.interim`, `transcription.final`, and `transcription.speechFinal`
- How `DeepgramTTS` streams 24 kHz audio for noticeably more natural speech
- Why the `auto` turn-taking strategy doesn't pause the mic during Deepgram TTS playback
- How Deepgram providers work in Firefox and Safari when `NativeSTT` does not

---

## What this adds over Example 00

Example 00 uses the browser's built-in Web Speech API: one transcript event per utterance, Chrome/Edge only. This example replaces both STT and TTS with Deepgram WebSocket providers.

The only difference in the `CompositeVoice` setup is the provider constructors — the SDK, events, and lifecycle are identical.

**STT upgrade:**
- Streams interim transcripts **word by word** in real time
- Works in Chrome, Edge, and **Firefox**
- Higher accuracy across accents, noise conditions, and languages
- Voice Activity Detection (VAD) for precise end-of-speech detection

**TTS upgrade:**
- Streams 24 kHz audio directly from Deepgram's synthesis API
- Noticeably more natural than the browser's SpeechSynthesis API
- Lower time-to-first-audio on most systems

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
cp examples/01-deepgram-anthropic-deepgram/sample.env examples/01-deepgram-anthropic-deepgram/.env
```

Open `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev
```

Open [http://localhost:3001](http://localhost:3001) in any modern browser — Chrome, Edge, or Firefox.

---

## How it works

```
Microphone
    ↓
DeepgramSTT (nova-3, WebSocket)
    ↓  transcription.interim  — word by word as you speak
    ↓  transcription.speechFinal  — VAD detects end of utterance → triggers LLM
AnthropicLLM (claude-haiku-4-5-20251001, HTTP streaming)
    ↓  llm.chunk  — token by token
DeepgramTTS (aura-2-thalia-en, WebSocket, 24 kHz)
    ↓
Speakers
    ↓  agent returns to listening
```

The `auto` turn-taking strategy is active by default. With Deepgram, the microphone stays **open** during TTS playback because Deepgram relies on hardware echo cancellation — so you can interrupt the agent while it's speaking.

### The core code

```javascript
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,
    options: {
      model: 'nova-3',
      smartFormat: true,
      interimResults: true,
      endpointing: 300,   // ms of silence before speech_final fires
    },
  }),
  llm: new AnthropicLLM({
    proxyUrl: `${window.location.origin}/proxy/anthropic`,
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    proxyUrl: `${window.location.origin}/proxy/deepgram`,
    options: {
      model: 'aura-2-thalia-en',
      encoding: 'linear16',
      sampleRate: 24000,
    },
  }),
});

await agent.initialize();
await agent.startListening();
```

---

## Provider options

### DeepgramSTT

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'nova-3'` | Transcription model. `nova-3` = best accuracy. `flux-general-en` = enables preflight signals (see Example 03). |
| `smartFormat` | `false` | Automatically format numbers, dates, and currency |
| `interimResults` | `false` | Emit partial transcripts while speaking |
| `endpointing` | `300` | ms of silence before `speechFinal` fires — lower = more responsive, higher = fewer split utterances |
| `vadEvents` | `false` | Enable Voice Activity Detection events |

### DeepgramTTS

| Option | Description |
|--------|-------------|
| `model` | Voice model — browse available voices at [console.deepgram.com](https://console.deepgram.com/) |
| `encoding` | Audio encoding — `linear16` (PCM) works reliably across all browsers |
| `sampleRate` | Output sample rate — `24000` gives the best quality |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Deepgram"**

- Verify your API key is correct and not revoked at [console.deepgram.com](https://console.deepgram.com/)
- Check the browser console for the specific Deepgram error code
- Corporate VPNs or firewalls may block outbound WebSocket connections on port 443

**No audio playback**

- Confirm system audio is not muted
- Check the browser console for TTS-related errors
- Some voice models require a paid Deepgram plan — try switching to `aura-2-thalia-en` (available on free tier)

**Transcripts are cut off mid-sentence**

Increase `endpointing` to wait longer before deciding an utterance is complete:

```javascript
new DeepgramSTT({ options: { endpointing: 500 } })
```

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [02 — Conversation history](../02-conversation-history/) | Multi-turn memory — the AI remembers earlier exchanges |
| [03 — Eager pipeline](../03-eager-pipeline/) | Lower latency with Deepgram v2 preflight signals |
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys completely out of the browser bundle |

---

## Browser support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome / Edge | Recommended | WebSocket and AudioWorklet fully supported |
| Firefox | Works | Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited | WebSocket AudioWorklet support varies by Safari version |
