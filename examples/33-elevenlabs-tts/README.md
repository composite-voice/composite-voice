# Example 33 — ElevenLabs TTS

High-quality neural text-to-speech from ElevenLabs with configurable voice ID, model, stability, and similarity boost. WebSocket-based streaming delivers natural-sounding speech with low latency.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `ElevenLabsTTS` | ElevenLabs via WebSocket | All modern browsers |

---

## What you'll learn

- How to configure `ElevenLabsTTS` with voiceId, model, stability, and similarityBoost
- How stability affects voice consistency vs. expressiveness
- How similarityBoost controls how closely the output matches the original voice
- The differences between ElevenLabs models (turbo vs. multilingual vs. monolingual)

---

## ElevenLabs TTS options demonstrated

| Option | Values | Description |
|--------|--------|-------------|
| `voiceId` | ElevenLabs voice ID | Select from pre-made or cloned voices |
| `model` | `eleven_turbo_v2_5`, `eleven_multilingual_v2`, `eleven_monolingual_v1` | Model quality/speed tradeoff |
| `stability` | 0.0 -- 1.0 | Higher = more consistent, lower = more expressive |
| `similarityBoost` | 0.0 -- 1.0 | Higher = closer to original voice, lower = more variation |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [ElevenLabs API key](https://elevenlabs.io/)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/33-elevenlabs-tts/sample.env examples/33-elevenlabs-tts/.env
```

Fill in your keys in `.env`.

---

## Run

```bash
pnpm example:33-elevenlabs-tts:dev
```

Open [http://localhost:3033](http://localhost:3033).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [30 — Native TTS](../30-native-tts/) | Free browser-native TTS |
| [31 — Deepgram TTS](../31-deepgram-tts/) | WebSocket streaming TTS with Deepgram |
| [32 — OpenAI TTS](../32-openai-tts/) | REST-based TTS with OpenAI |
| [34 — Cartesia TTS](../34-cartesia-tts/) | Ultra-low-latency streaming TTS |
