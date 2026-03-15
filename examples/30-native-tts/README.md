# Example 30 — Native TTS

Browser-native text-to-speech with full control over voice selection, rate, and pitch. Uses the SpeechSynthesis API built into all modern browsers -- no API keys needed for TTS, just Anthropic for the LLM.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (free, built-in) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free, built-in) | All modern browsers |

---

## What you'll learn

- How to list and select from available browser voices using `speechSynthesis.getVoices()`
- How to configure `NativeTTS` with `voiceName`, `rate`, and `pitch` options
- The difference between local and cloud-backed voices
- How voice availability varies across browsers and operating systems

---

## NativeTTS options demonstrated

| Option | Type | Range | Description |
|--------|------|-------|-------------|
| `voiceName` | `string` | System voices | Select a specific voice by name |
| `rate` | `number` | 0.1 -- 3.0 | Speech rate (1.0 = normal) |
| `pitch` | `number` | 0 -- 2.0 | Voice pitch (1.0 = normal) |
| `preferLocal` | `boolean` | — | Prefer on-device voices over cloud-backed |

---

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/30-native-tts/sample.env examples/30-native-tts/.env
```

Fill in your Anthropic key in `.env`.

---

## Run

```bash
pnpm example:30-native-tts:dev
```

Open [http://localhost:3030](http://localhost:3030) in Chrome or Edge.

1. Select a voice from the dropdown
2. Adjust rate and pitch sliders
3. Click **Initialize**, then **Start**
4. Speak and hear the AI respond in your chosen voice

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [31 — Deepgram TTS](../31-deepgram-tts/) | WebSocket TTS with Deepgram Aura voices |
| [32 — OpenAI TTS](../32-openai-tts/) | OpenAI TTS with multiple voice options |
| [33 — ElevenLabs TTS](../33-elevenlabs-tts/) | High-quality neural TTS with ElevenLabs |
| [34 — Cartesia TTS](../34-cartesia-tts/) | Low-latency streaming TTS with Cartesia |
