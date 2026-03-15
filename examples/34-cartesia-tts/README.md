# Example 34 — Cartesia TTS

Ultra-low-latency streaming text-to-speech from Cartesia with configurable voice, model, emotion tags, speed, and language. WebSocket-based Sonic engine delivers real-time audio with sub-200ms time-to-first-byte.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `CartesiaTTS` | Cartesia Sonic via WebSocket | All modern browsers |

---

## What you'll learn

- How to configure `CartesiaTTS` with voiceId, modelId, speed, language, and emotion controls
- How Cartesia emotion tags affect speech expressiveness
- The speed options from `slowest` to `fastest`
- How Cartesia's streaming architecture delivers ultra-low-latency audio

---

## Cartesia TTS options demonstrated

| Option | Values | Description |
|--------|--------|-------------|
| `voiceId` | Cartesia voice UUID | Select from Cartesia voice library |
| `modelId` | `sonic-2`, `sonic-english`, `sonic-multilingual` | Model variant |
| `emotions` | `positivity`, `negativity`, `surprise`, `curiosity`, `anger`, `sadness` | Emotion tags for expressive speech |
| `speed` | `slowest`, `slow`, `normal`, `fast`, `fastest` | Speech rate |
| `language` | `en`, `fr`, `de`, `es`, `ja`, `zh` | Output language |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- A [Cartesia API key](https://cartesia.ai/)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/34-cartesia-tts/sample.env examples/34-cartesia-tts/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:34-cartesia-tts:dev
```

Open [http://localhost:3034](http://localhost:3034).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [30 — Native TTS](../30-native-tts/) | Free browser-native TTS |
| [31 — Deepgram TTS](../31-deepgram-tts/) | WebSocket streaming TTS with Deepgram |
| [32 — OpenAI TTS](../32-openai-tts/) | REST-based TTS with OpenAI |
| [33 — ElevenLabs TTS](../33-elevenlabs-tts/) | High-quality neural TTS with ElevenLabs |
