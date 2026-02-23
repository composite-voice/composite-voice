# Example 01 — Deepgram + Anthropic + Deepgram

Best-in-class voice agent using Deepgram's real-time WebSocket speech models with Anthropic's fastest Claude model.

| | Provider | Transport |
|-|----------|-----------|
| **STT** | `DeepgramSTT` — nova-3 | WebSocket, real-time |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | HTTP streaming |
| **TTS** | `DeepgramTTS` — aura-2-thalia-en | WebSocket, 24 kHz |

This is the recommended production configuration. All three providers stream in real time — the transcript appears as you speak, and audio playback starts within a second of finishing your sentence.

---

## What this adds over Example 00

Example 00 uses the browser's built-in Web Speech API, which is Chrome/Edge-only and produces a single transcript event per utterance. This example replaces it with Deepgram's nova-3 model, which:

- Streams interim transcripts **word by word** in real time
- Works in Chrome, Edge, **and Firefox**
- Supports far more languages and dialects
- Fires a `speech_final` event when Deepgram's VAD (voice activity detection) detects a pause, giving you precise control over when to trigger the LLM

The TTS upgrade from `NativeTTS` to `DeepgramTTS` streams audio at 24 kHz over WebSocket, producing significantly more natural speech than the browser's SpeechSynthesis API.

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

# 3. Copy the sample env file
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
    ↓  transcription.interim (word-by-word)
    ↓  transcription.speechFinal (end of utterance)
AnthropicLLM (claude-haiku-4-5, HTTP streaming)
    ↓  llm.chunk
DeepgramTTS (aura-2-thalia-en, WebSocket, 24 kHz)
    ↓
Speakers
```

1. **Initialize** — connects DeepgramSTT and DeepgramTTS via WebSocket and sets up the AnthropicLLM HTTP client
2. **Start Listening** — opens your microphone and begins streaming audio to Deepgram's transcription service
3. **Speak** — nova-3 streams interim transcripts word by word as you talk
4. **Pause** — Deepgram fires a `speech_final` event; the complete utterance is sent to the LLM
5. **LLM response** — claude-haiku-4-5 streams tokens back as they're generated
6. **TTS playback** — Deepgram aura-2 synthesizes the response and plays it through your speakers in real time
7. **Loop** — once playback finishes, the agent returns to listening

The `auto` turn-taking strategy is active by default: the microphone is not paused during TTS playback because Deepgram's echo cancellation prevents audio feedback.

### Key code

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
    model: 'claude-haiku-4-5',
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

## Configuration options

### DeepgramSTT

| Option | Description |
|--------|-------------|
| `model` | Transcription model. `nova-3` is recommended; `flux-general-en` enables preflight events (Example 03) |
| `smartFormat` | Formats numbers, dates, and currency intelligently |
| `interimResults` | Emit partial transcripts while speaking |
| `endpointing` | Silence duration (ms) before `speech_final` fires. Lower = faster but may split utterances |
| `vadEvents` | Enable voice activity detection events |
| `language` | BCP-47 language code — defaults to `en-US` |

### DeepgramTTS

| Option | Description |
|--------|-------------|
| `model` | Voice model. Browse available voices at [console.deepgram.com](https://console.deepgram.com/) |
| `encoding` | Audio encoding — `linear16` works across all browsers |
| `sampleRate` | Output sample rate. `24000` (24 kHz) gives the best quality |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Deepgram"**

- Verify your Deepgram API key is correct and has not expired
- Check the browser console for the specific error message
- A corporate VPN or firewall may block WebSocket connections to external services

**No audio playback**

- Make sure your system audio is not muted
- Try a different voice model in the `DeepgramTTS` config
- Check the browser console for errors from the audio playback pipeline

**Transcripts look incorrect or stop mid-sentence**

- Adjust `endpointing` — a higher value (e.g. `500`) waits longer before deciding an utterance is complete
- Try `smartFormat: true` if you haven't already

**"Cannot find module '@lukeocodes/composite-voice'"**

Build the SDK first:

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[02 — Conversation history](../02-conversation-history/)** | Multi-turn memory so the AI remembers earlier exchanges |
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Lower latency with Deepgram v2 preflight signals |
| **[04 — Server-side proxy](../04-proxy-server/)** | Keep API keys out of the browser entirely |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Works — Deepgram WebSocket providers don't require Web Speech API |
| Safari | Limited — WebSocket-based AudioWorklet support varies by version |
