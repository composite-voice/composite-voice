# Example 32 — OpenAI TTS

OpenAI text-to-speech with configurable model quality, voice persona, output format, and playback speed. REST-based TTS delivers the complete audio in a single response.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `OpenAITTS` | OpenAI TTS via REST API | All modern browsers |

---

## What you'll learn

- How to configure `OpenAITTS` with model, voice, format, and speed options
- The difference between `tts-1` (fast, lower quality) and `tts-1-hd` (slower, higher quality)
- How the six OpenAI voices (alloy, echo, fable, onyx, nova, shimmer) differ in tone
- How REST-based TTS works compared to WebSocket streaming TTS

---

## OpenAI TTS options demonstrated

| Option | Values | Description |
|--------|--------|-------------|
| `model` | `tts-1`, `tts-1-hd` | Quality tier |
| `voice` | `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | Voice persona |
| `responseFormat` | `mp3`, `opus`, `aac`, `flac` | Output audio format |
| `speed` | 0.25 -- 4.0 | Playback speed multiplier |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [OpenAI API key](https://platform.openai.com/)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/32-openai-tts/sample.env examples/32-openai-tts/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:32-openai-tts:dev
```

Open [http://localhost:3032](http://localhost:3032).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [30 — Native TTS](../30-native-tts/) | Free browser-native TTS |
| [31 — Deepgram TTS](../31-deepgram-tts/) | WebSocket streaming TTS |
| [33 — ElevenLabs TTS](../33-elevenlabs-tts/) | High-quality neural TTS |
| [34 — Cartesia TTS](../34-cartesia-tts/) | Ultra-low-latency streaming TTS |
