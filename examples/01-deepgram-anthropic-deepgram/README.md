# Example 01 — Deepgram + Anthropic + Deepgram

The recommended production configuration: real-time WebSocket speech recognition, the fastest Claude model, and streaming TTS at 24 kHz.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time streaming |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

All three providers stream in real time — the transcript appears as you speak, and audio playback starts within a second of you finishing your sentence.

---

## What you'll learn

- How `DeepgramSTT` streams transcript words in real time via WebSocket
- The difference between `transcription.interim`, `transcription.final`, and `transcription.speechFinal` events
- How `DeepgramTTS` streams audio at 24 kHz for natural-sounding speech
- What the `auto` turn-taking strategy does and why it's different from Example 00
- Why Deepgram providers work in Firefox when `NativeSTT` does not

---

## What this adds over Example 00

Example 00 uses the browser's built-in Web Speech API, which produces a single transcript event per utterance and only works in Chrome/Edge. This example replaces it with Deepgram's nova-3 model, which:

- Streams interim transcripts **word by word** in real time
- Works in Chrome, Edge, **and Firefox**
- Supports far more languages and dialects
- Uses voice activity detection (VAD) to precisely determine when an utterance has ended

The TTS upgrade from `NativeTTS` to `DeepgramTTS` streams audio at 24 kHz over WebSocket — noticeably more natural than the browser's SpeechSynthesis API.

---

## Prerequisites

- Node.js 18+
- pnpm
- A [Deepgram API key](https://console.deepgram.com/) — free tier available, no credit card required
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

Open [http://localhost:3001](http://localhost:3001) in any modern browser.

---

## How it works

```
Microphone
    ↓
DeepgramSTT (nova-3, WebSocket)
    ↓  transcription.interim  (word by word as you speak)
    ↓  transcription.speechFinal  (full utterance — triggers the LLM)
AnthropicLLM (claude-haiku-4-6, HTTP streaming)
    ↓  llm.chunk  (token by token)
DeepgramTTS (aura-2-thalia-en, WebSocket, 24 kHz)
    ↓
Speakers
```

Step by step:

1. **Initialize** — connects `DeepgramSTT` and `DeepgramTTS` via WebSocket, sets up the Anthropic HTTP client
2. **Start Listening** — opens the microphone and begins streaming PCM audio to Deepgram
3. **Speak** — nova-3 streams interim transcripts word by word as you talk
4. **Pause** — Deepgram's VAD fires a `speech_final` event; the complete utterance is sent to the LLM
5. **LLM response** — claude-haiku-4-6 streams tokens back as they're generated
6. **TTS playback** — Deepgram aura-2 synthesizes the response and plays it back in real time
7. **Loop** — once playback finishes, the agent returns to listening

The `auto` turn-taking strategy is active by default: the microphone is **not** paused during TTS playback because Deepgram's echo cancellation prevents audio feedback. This means the agent can hear you interrupt it.

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

### DeepgramSTT

| Option | Description |
|--------|-------------|
| `model` | Transcription model. `nova-3` is recommended. `flux-general-en` enables preflight events (see Example 03). |
| `smartFormat` | Formats numbers, dates, and currency automatically |
| `interimResults` | Emit partial transcripts while speaking |
| `endpointing` | Silence duration (ms) before `speech_final` fires. Lower = faster but may split utterances. |
| `vadEvents` | Enable voice activity detection events |
| `language` | BCP-47 language code — defaults to `en-US` |

### DeepgramTTS

| Option | Description |
|--------|-------------|
| `model` | Voice model. Browse available voices at [console.deepgram.com](https://console.deepgram.com/) |
| `encoding` | Audio encoding — `linear16` (PCM) works reliably across all browsers |
| `sampleRate` | Output sample rate. `24000` (24 kHz) gives the best quality |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Deepgram"**

- Verify your Deepgram API key is correct and has not been revoked
- Check the browser console for the specific error message
- A corporate VPN or firewall may block WebSocket connections to external services

**No audio playback**

- Confirm your system audio is not muted
- Check the browser console for errors from the TTS pipeline
- Try a different voice model in `DeepgramTTS` options

**Transcripts look wrong or cut off mid-sentence**

- Increase `endpointing` (e.g. `500` ms) — this waits longer before deciding an utterance is complete
- Ensure `smartFormat: true` for better formatting of numbers and proper nouns

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
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys out of the browser entirely |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited — WebSocket AudioWorklet support varies by Safari version |
