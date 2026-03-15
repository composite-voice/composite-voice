# Example 03 -- Cloud Providers

Upgrades from browser-native providers to cloud-grade alternatives: Deepgram WebSocket STT and TTS for real-time audio streaming, and Anthropic Claude for the LLM. All API keys stay server-side via the Vite dev proxy.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `DeepgramSTT` | WebSocket, real-time streaming | All modern browsers |
| **LLM** | `AnthropicLLM` -- claude-haiku-4-5 | HTTP streaming | All |
| **TTS** | `DeepgramTTS` | WebSocket, 24 kHz audio | All modern browsers |

---

## What you'll learn

- How to swap `NativeSTT` / `NativeTTS` for Deepgram WebSocket providers
- How the Vite proxy injects API keys so nothing is exposed in the browser
- The difference in latency and accuracy between native and cloud providers
- How `DeepgramSTT` streams interim transcripts word-by-word via WebSocket
- How `DeepgramTTS` streams synthesized audio for lower time-to-first-audio

---

## What this adds over Example 00

Example 00 uses browser-native providers (Web Speech API for STT, SpeechSynthesis for TTS). This example replaces both with Deepgram WebSocket providers while keeping the same SDK lifecycle and events.

**STT upgrade:**
- Real-time word-by-word interim transcripts over WebSocket
- Works in Chrome, Edge, **and Firefox** (no Web Speech API dependency)
- Higher accuracy across accents, noise conditions, and languages
- Voice Activity Detection for precise end-of-speech detection

**TTS upgrade:**
- Streams 24 kHz synthesized audio directly from Deepgram
- Noticeably more natural than the browser's SpeechSynthesis API
- Lower time-to-first-audio on most systems

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- A [Deepgram API key](https://console.deepgram.com/) -- free tier, no credit card required
- An [Anthropic API key](https://console.anthropic.com/) -- free to create, pay per token

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/03-cloud-providers/sample.env examples/03-cloud-providers/.env
```

Open `.env` and fill in your keys:

```env
DEEPGRAM_API_KEY=your-deepgram-key-here
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
cd examples/03-cloud-providers
pnpm dev
```

Open [http://localhost:3003](http://localhost:3003) in any modern browser -- Chrome, Edge, or Firefox.

1. Click **Initialize** -- connects providers and requests microphone permission
2. Click **Start Listening** -- the agent begins listening
3. Speak -- your words appear in the Transcript card, Claude's response streams into the Response card
4. Click **Stop** when done

---

## How it works

```
Microphone (browser MediaStream API)
    |
DeepgramSTT (WebSocket, real-time streaming)
    |  transcription.interim  -- word by word as you speak
    |  transcription.speechFinal  -- VAD detects end of utterance, triggers LLM
    v
AnthropicLLM (claude-haiku-4-5, HTTP streaming)
    |  llm.chunk  -- token by token
    v
DeepgramTTS (WebSocket, 24 kHz audio)
    |
Speakers
    |  returns to listening automatically
```

### The core code

Three cloud providers, zero client-side keys. The Vite dev proxy injects API keys on every request.

```tsx
const voice = new CompositeVoice({
  providers: [
    new DeepgramSTT({ proxyUrl: '/proxy/deepgram', interimResults: true }),
    new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: '/proxy/deepgram' }),
  ],
});

await voice.initialize();
await voice.startListening();
```

---

## Provider options

### DeepgramSTT

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the WebSocket proxy |
| `interimResults` | `false` | Emit partial transcripts while speaking |
| `language` | `'en-US'` | BCP-47 language tag |
| `model` | `'nova-3'` | Transcription model |
| `smartFormat` | `false` | Automatically format numbers, dates, currency |
| `endpointing` | `300` | ms of silence before `speechFinal` fires |

### AnthropicLLM

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the HTTP proxy |
| `model` | required | Anthropic model ID |
| `systemPrompt` | -- | Sets the AI's persona and response style |
| `maxTokens` | `200` | Maximum response length in tokens |
| `temperature` | `0.7` | Randomness: `0` = deterministic, `1` = creative |

### DeepgramTTS

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the WebSocket proxy |
| `model` | `'aura-2-thalia-en'` | Voice model |
| `encoding` | `'linear16'` | Audio encoding |
| `sampleRate` | `24000` | Output sample rate in Hz |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Deepgram"**

- Verify your API key is correct at [console.deepgram.com](https://console.deepgram.com/)
- Check the browser console for the specific error
- Corporate VPNs or firewalls may block outbound WebSocket connections

**No audio playback**

- Confirm system audio is not muted
- Check the browser console for TTS errors
- Some voice models require a paid Deepgram plan -- try `aura-2-thalia-en` (available on free tier)

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [01 -- Conversation History](../01-conversation-history/) | Multi-turn memory so the AI remembers earlier exchanges |
| [04 -- Error Recovery](../04-error-recovery/) | Graceful degradation and reconnection strategies |
| [05 -- Turn Taking](../05-turn-taking/) | Auto, conservative, aggressive, and detect modes |
| [20 -- Deepgram Pipeline](../20-deepgram-pipeline/) | Full Deepgram pipeline with advanced configuration |
