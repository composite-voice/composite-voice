# Example 01 — Deepgram + Anthropic + Deepgram

The recommended production configuration: real-time WebSocket STT, Claude for intelligence, and 24 kHz streaming TTS. All three providers stream simultaneously. Works in Firefox too.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time streaming |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

---

## What you'll learn

- How `DeepgramSTT` streams transcript words in real time over WebSocket
- The difference between `transcription.interim`, `transcription.final`, and `transcription.speechFinal` events
- How `DeepgramTTS` streams audio at 24 kHz for natural-sounding speech
- What the `auto` turn-taking strategy does and why it differs from Example 00
- Why Deepgram providers work in Firefox when `NativeSTT` does not

---

## What this adds over Example 00

Example 00 uses the browser's built-in Web Speech API: one transcript event per utterance, Chrome/Edge only. This example replaces it with Deepgram's nova-3 model:

- Streams interim transcripts **word by word** in real time via WebSocket
- Works in Chrome, Edge, **and Firefox**
- Higher accuracy across languages, accents, and noisy environments
- Uses voice activity detection (VAD) to precisely detect end of speech

The TTS upgrade from `NativeTTS` to `DeepgramTTS` streams audio at 24 kHz — noticeably more natural than the browser's SpeechSynthesis API.

---

## Prerequisites

- Node.js 18+
- pnpm
- A [Deepgram API key](https://console.deepgram.com/) — free tier, no credit card required
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands from the **repo root**:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the env template and add your keys
cp examples/01-deepgram-anthropic-deepgram/sample.env examples/01-deepgram-anthropic-deepgram/.env
```

Edit `.env`:

```env
VITE_DEEPGRAM_API_KEY=your-deepgram-key-here
VITE_ANTHROPIC_API_KEY=your-anthropic-key-here
```

---

## Run

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev
```

Open [http://localhost:3001](http://localhost:3001) in any modern browser.

---

## How it works

```
Microphone
    ↓
DeepgramSTT (nova-3, WebSocket)
    ↓  transcription.interim  (word by word as you speak)
    ↓  transcription.speechFinal  (VAD detects end of utterance → triggers LLM)
AnthropicLLM (claude-haiku-4-6, HTTP streaming)
    ↓  llm.chunk  (token by token)
DeepgramTTS (aura-2-thalia-en, WebSocket, 24 kHz)
    ↓
Speakers
    ↓  agent returns to listening
```

The `auto` turn-taking strategy is active by default: the microphone is **not** paused during TTS playback because Deepgram's echo cancellation handles audio feedback. This means the agent can hear you interrupt it.

### Core code

```javascript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: DEEPGRAM_API_KEY,
    options: {
      model: 'nova-3',
      smartFormat: true,
      interimResults: true,
      endpointing: 300,  // ms of silence before speech_final fires
    },
  }),
  llm: new AnthropicLLM({
    apiKey: ANTHROPIC_API_KEY,
    model: 'claude-haiku-4-6',
    systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    apiKey: DEEPGRAM_API_KEY,
    options: {
      model: 'aura-2-thalia-en',
      encoding: 'linear16',
      sampleRate: 24000,
    },
  }),
});
```

---

## Configuration reference

### DeepgramSTT options

| Option | Description |
|--------|-------------|
| `model` | Transcription model. `nova-3` is recommended for best accuracy. `flux-general-en` enables preflight events (see Example 03). |
| `smartFormat` | Automatically formats numbers, dates, and currency |
| `interimResults` | Emit partial transcripts while speaking |
| `endpointing` | Silence in ms before `speech_final` fires. Lower = more responsive but may split long utterances. |
| `vadEvents` | Enable voice activity detection events |

### DeepgramTTS options

| Option | Description |
|--------|-------------|
| `model` | Voice model — browse available voices at [console.deepgram.com](https://console.deepgram.com/) |
| `encoding` | Audio encoding — `linear16` (PCM) works reliably across all browsers |
| `sampleRate` | Output sample rate — `24000` gives the best quality |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Deepgram"**

- Verify your API key is correct and not revoked
- Check the browser console for the specific error message
- A corporate VPN or firewall may block WebSocket connections to external services

**No audio playback**

- Confirm your system audio is not muted
- Check the browser console for TTS errors
- Try a different voice model in the `DeepgramTTS` options

**Transcripts are cut off mid-sentence**

Increase `endpointing` (e.g. `500` ms) — this waits longer before deciding an utterance is complete.

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [02 — Conversation history](../02-conversation-history/) | Multi-turn memory so the AI remembers earlier exchanges |
| [03 — Eager pipeline](../03-eager-pipeline/) | Lower latency with Deepgram v2 preflight signals |
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys completely out of the browser |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited — WebSocket AudioWorklet support varies by Safari version |
