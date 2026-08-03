# Example 03 -- Cloud Providers

Upgrades from browser-native providers to cloud-grade alternatives: Speechmatics WebSocket STT for real-time transcription, Speechify REST TTS for synthesis, and Anthropic Claude for the LLM. All API keys stay server-side via the Vite dev proxy.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `SpeechmaticsSTT` | WebSocket, real-time streaming | All modern browsers |
| **LLM** | `AnthropicLLM` -- claude-haiku-4-5 | HTTP streaming | All |
| **TTS** | `SpeechifyTTS` | REST, one MP3 per utterance | All modern browsers |

---

## What you'll learn

- How to swap `NativeSTT` / `NativeTTS` for cloud providers
- How the Vite proxy injects API keys so nothing is exposed in the browser
- The difference in latency and accuracy between native and cloud providers
- How `SpeechmaticsSTT` streams interim transcripts over a WebSocket and completes a turn with `EndOfUtterance`
- How a REST TTS provider like `SpeechifyTTS` differs from a streaming one: one HTTP request per reply, complete audio returned as a `Blob`

---

## What this adds over Example 00

Example 00 uses browser-native providers (Web Speech API for STT, SpeechSynthesis for TTS). This example replaces both with cloud providers while keeping the same SDK lifecycle and events.

**STT upgrade:**
- Real-time interim transcripts over WebSocket
- Works in Chrome, Edge, **and Firefox** (no Web Speech API dependency)
- Higher accuracy across accents, noise conditions, and languages
- Server-side end-of-utterance detection for precise turn-taking

**TTS upgrade:**
- Simba voices are noticeably more natural than the browser's SpeechSynthesis API
- One HTTP request per reply, no WebSocket to manage
- Trade-off: audio arrives only when the whole utterance is synthesized, so time-to-first-audio is higher than with a streaming TTS provider

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- A [Speechmatics API key](https://portal.speechmatics.com/) -- free trial hours, no credit card required
- A [Speechify API key](https://console.sws.speechify.com/)
- An [Anthropic API key](https://console.anthropic.com/) -- free to create, pay per token

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. See which keys this example needs
cat examples/03-cloud-providers/sample.env
```

Vite loads the **repo-root** `.env` (`envDir` points there). Add any of these keys it
does not already have — do not append duplicates:

```env
SPEECHMATICS_API_KEY=your-speechmatics-key-here
SPEECHIFY_API_KEY=your-speechify-key-here
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
SpeechmaticsSTT (WebSocket, real-time streaming)
    |  transcription.interim  -- partials as you speak
    |  transcription.speechFinal  -- EndOfUtterance ends the turn, triggers LLM
    v
AnthropicLLM (claude-haiku-4-5, HTTP streaming)
    |  llm.chunk  -- token by token
    v
SpeechifyTTS (REST, complete MP3 per reply)
    |
Speakers
    |  returns to listening automatically
```

### The core code

Three cloud providers, zero client-side keys. The Vite dev proxy injects API keys on every request.

```tsx
const voice = new CompositeVoice({
  providers: [
    new SpeechmaticsSTT({ proxyUrl: '/proxy/speechmatics', interimResults: true }),
    new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new SpeechifyTTS({ proxyUrl: '/proxy/speechify', voiceId: 'geffen_32' }),
  ],
});

await voice.initialize();
await voice.startListening();
```

---

## Provider options

### SpeechmaticsSTT

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the WebSocket proxy |
| `interimResults` | `true` | Emit partial transcripts while speaking |
| `language` | `'en'` | ISO 639-1 language code |
| `outputLocale` | -- | Transcript spelling, e.g. `'en-GB'` |
| `operatingPoint` | server default | `'standard'` or `'enhanced'` (more accurate, more latency) |
| `endOfUtteranceSilenceTrigger` | `0.75` | Seconds of silence that end a turn; `0` disables detection |
| `maxDelay` | `1` | Seconds between a spoken word and its final transcript; must exceed the silence trigger |

### AnthropicLLM

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the HTTP proxy |
| `model` | required | Anthropic model ID |
| `systemPrompt` | -- | Sets the AI's persona and response style |
| `maxTokens` | `200` | Maximum response length in tokens |
| `temperature` | `0.7` | Randomness: `0` = deterministic, `1` = creative |

### SpeechifyTTS

| Option | Default | Description |
|--------|---------|-------------|
| `proxyUrl` | required | URL prefix for the HTTP proxy |
| `voiceId` | required | Voice to synthesize with -- list them via Speechify's `GET /v1/voices` |
| `model` | `'simba-english'` | Simba model; use `'simba-multilingual'` for non-English |
| `audioFormat` | `'mp3'` | `mp3`, `wav`, `ogg`, or `aac` |
| `language` | auto-detected | ISO 639-1 code, optionally with a region (`'en-US'`) |

---

## Troubleshooting

**WebSocket connection fails / "Unable to connect to Speechmatics"**

- Verify your API key is correct at [portal.speechmatics.com](https://portal.speechmatics.com/)
- Check the browser console for the specific error
- Corporate VPNs or firewalls may block outbound WebSocket connections

**No audio playback**

- Confirm system audio is not muted
- Check the browser console for TTS errors
- A `voiceId` that does not exist on your Speechify account fails the request -- list valid ids with `GET /v1/voices`

**"Cannot find module 'composite-voice'"**

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
| [11 -- Deepgram STT](../11-deepgram-stt/) | A streaming Deepgram pipeline with advanced configuration |
