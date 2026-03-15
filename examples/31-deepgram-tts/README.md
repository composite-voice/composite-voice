# Example 31 — Deepgram TTS

Deepgram Aura text-to-speech with configurable voice model, sample rate, and encoding format. WebSocket-based streaming TTS delivers low-latency audio playback.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `DeepgramTTS` | Deepgram Aura via WebSocket | All modern browsers |

---

## What you'll learn

- How to configure `DeepgramTTS` with voice model, sample rate, and encoding options
- How WebSocket-based TTS differs from REST-based TTS (streaming vs. batch)
- How `BrowserAudioOutput` decodes and plays raw PCM audio
- The available Deepgram Aura voice models and their characteristics

---

## DeepgramTTS options demonstrated

| Option | Values | Description |
|--------|--------|-------------|
| `model` | `aura-2-thalia-en`, `aura-2-arcas-en`, etc. | Voice model selection |
| `sampleRate` | `16000`, `24000`, `48000` | Audio sample rate in Hz |
| `encoding` | `linear16`, `mulaw`, `alaw` | Audio encoding format |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- A [Deepgram API key](https://console.deepgram.com/) (free tier available)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/31-deepgram-tts/sample.env examples/31-deepgram-tts/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:31-deepgram-tts:dev
```

Open [http://localhost:3031](http://localhost:3031).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [30 — Native TTS](../30-native-tts/) | Free browser-native TTS |
| [32 — OpenAI TTS](../32-openai-tts/) | REST-based TTS with OpenAI voices |
| [33 — ElevenLabs TTS](../33-elevenlabs-tts/) | High-quality neural TTS |
| [34 — Cartesia TTS](../34-cartesia-tts/) | Ultra-low-latency streaming TTS |
