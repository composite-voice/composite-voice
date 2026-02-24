# Example 13 — Multi-Language

Language switching mid-session. Select a language and the entire voice pipeline reconfigures — speech recognition, LLM system prompt, and text-to-speech voice all switch together.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API (BCP-47 language tag) | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API (language-matched voice) | All modern browsers |

---

## What you'll learn

- How to switch `NativeSTT`'s recognition language at runtime using BCP-47 tags
- How to update the `AnthropicLLM` system prompt so Claude responds in the selected language
- How to find and select a `NativeTTS` voice that matches the target language
- How to dispose and reinitialize the agent when configuration changes
- The supported languages and their BCP-47 codes: `en-US`, `es-ES`, `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — the Web Speech API is not available in Firefox or Safari
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/13-multi-language/sample.env examples/13-multi-language/.env
```

Open `.env` and fill in your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:13-multi-language:dev
```

Open [http://localhost:3013](http://localhost:3013) in Chrome or Edge.

1. Select a language card (English, Spanish, French, German, Japanese, or Portuguese)
2. Click **Initialize** — connects providers with the selected language
3. Click **Start** — the agent begins listening in the chosen language
4. Speak in the selected language — Claude responds in that language
5. Click a different language card to switch mid-session — the agent reinitializes automatically

---

## How it works

```
Language selected
    ↓
NativeSTT reconfigured  (language: 'es-ES')
AnthropicLLM updated    (systemPrompt: 'Responde en español...')
NativeTTS voice matched  (finds a Spanish voice)
    ↓
Agent disposed → reinitialized with new config
    ↓
Microphone → NativeSTT → AnthropicLLM → NativeTTS → Speakers
```

### The key insight

`NativeSTT` accepts a BCP-47 language tag (like `es-ES` or `ja-JP`) that tells the browser's speech recognition engine which language to expect. `NativeTTS` will try to find a voice matching the same language. The system prompt tells Claude which language to respond in, completing the multilingual pipeline.

```javascript
// Switch to Spanish
const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'es-ES' }),
  llm: new AnthropicLLM({
    systemPrompt: 'Responde siempre en español...',
  }),
  tts: new NativeTTS({ voice: 'Mónica' }), // Spanish voice
});
```

---

## Supported languages

| Language | BCP-47 | STT support | TTS voices |
|----------|--------|-------------|------------|
| English | `en-US` | Excellent | Many available |
| Spanish | `es-ES` | Good | Several available |
| French | `fr-FR` | Good | Several available |
| German | `de-DE` | Good | Several available |
| Japanese | `ja-JP` | Good | Varies by OS |
| Portuguese | `pt-BR` | Good | Several available |

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [02 — System Persona](../02-system-persona/) | Combine language switching with personas |
| [01 — Conversation History](../01-conversation-history/) | Multi-turn memory in any language |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | WebSocket STT/TTS with broader language support |
| [30 — Anthropic Models](../30-anthropic-models/) | Compare model quality across languages |
