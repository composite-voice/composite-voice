# CompositeVoice Examples

Self-contained React + Vite apps that each demonstrate a specific SDK feature or provider combination. Work through them in order for a progressive learning path, or jump to the one that matches your use case.

---

## Prerequisites

- **Node.js** 18 or later
- **pnpm** -- `npm install -g pnpm`
- **Chrome or Edge** for NativeSTT examples (Web Speech API limitation)
- API keys for the providers used by each example

---

## Quick start

From the repo root, install and build once:

```bash
pnpm install && pnpm build
```

Run any example using the generic script:

```bash
pnpm example @lukeocodes/composite-voice-example-XX-name dev
```

Or navigate into the example directory:

```bash
cd examples/XX-example-name
pnpm dev
```

---

## Planned Examples

### Core SDK (00-09)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 00 | Minimal Voice Agent | NativeSTT + AnthropicLLM + NativeTTS | Minimum viable setup, state machine basics |
| 01 | Conversation History | + conversationHistory | Multi-turn memory, getHistory(), clearHistory() |
| 02 | System Persona | + systemPrompt config | Custom personality, persona configuration |
| 03 | Event Inspector | Event system | Full event stream visualization and debugging |
| 04 | Error Recovery | Error handling | Graceful degradation, reconnection strategies |
| 05 | Turn Taking | Turn-taking strategies | Auto, conservative, aggressive, detect modes |

### Infrastructure (10-19)

| # | Name | Stack | What it demonstrates |
|---|------|-------|---------------------|
| 10 | Express Proxy Server | Express + createExpressProxy | Server-side API key injection |
| 11 | Next.js Proxy | Next.js adapter | Next.js API route integration |
| 12 | Custom Provider | Base classes | Building your own STT/LLM/TTS provider |
| 13 | Multi-Language | i18n config | Language and locale configuration |

### Deepgram (20-29)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 20 | Deepgram Pipeline | DeepgramSTT + AnthropicLLM + DeepgramTTS | Full Deepgram WebSocket pipeline |
| 21 | Eager Pipeline | DeepgramFlux + eagerLLM | Speculative generation, reduced latency |
| 22 | Deepgram Options | DeepgramSTT config | Model selection, language, encoding options |
| 23 | Deepgram Voices | DeepgramTTS config | Voice selection, speech rate, pitch |
| 24 | Deepgram Conversation History | Deepgram + history | Multi-turn with Deepgram pipeline |

### Anthropic (30-39)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 30 | Anthropic Models | AnthropicLLM config | Model selection (Claude variants) |
| 31 | Anthropic Streaming Config | AnthropicLLM streaming | Streaming configuration and chunk handling |

### OpenAI (40-49)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 40 | OpenAI Pipeline | NativeSTT + OpenAILLM + NativeTTS | OpenAI as the LLM provider |
| 41 | OpenAI + Deepgram | DeepgramSTT + OpenAILLM + DeepgramTTS | Mixed provider pipeline |
| 42 | OpenAI TTS Pipeline | NativeSTT + OpenAILLM + OpenAITTS | OpenAI for both LLM and TTS |

### WebLLM (50-59)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 50 | WebLLM Pipeline | NativeSTT + WebLLMLLM + NativeTTS | Fully in-browser LLM, no API keys |

### Groq (60-69)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 60 | Groq Pipeline | NativeSTT + GroqLLM + NativeTTS | Groq as the LLM provider |

### AssemblyAI (70-79)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 70 | AssemblyAI Pipeline | AssemblyAISTT + AnthropicLLM + NativeTTS | AssemblyAI real-time STT |

### ElevenLabs (80-89)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 80 | ElevenLabs Pipeline | NativeSTT + AnthropicLLM + ElevenLabsTTS | ElevenLabs WebSocket TTS |
| 81 | ElevenLabs STT | ElevenLabsSTT + AnthropicLLM + ElevenLabsTTS | Full ElevenLabs pipeline |

### Cartesia (90-99)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 90 | Cartesia Pipeline | NativeSTT + AnthropicLLM + CartesiaTTS | Cartesia WebSocket TTS |

### Gemini (100-109)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 100 | Gemini Pipeline | NativeSTT + GeminiLLM + NativeTTS | Google Gemini as the LLM provider |

### Mistral (110-119)

| # | Name | Providers | What it demonstrates |
|---|------|-----------|---------------------|
| 110 | Mistral Pipeline | NativeSTT + MistralLLM + NativeTTS | Mistral as the LLM provider |

---

## Shared Infrastructure

The `_shared/` directory contains reusable pieces for all examples:

- **`vite.config.factory.ts`** -- Shared Vite config with proxy setup for all supported providers
- **`ExampleShell.tsx`** -- Consistent layout with navbar, theme toggle, and badge
- **`VoiceAgent.tsx`** -- Reusable voice agent UI with state display, transcript, and response cards
- **`main.tsx`** -- Standard React entry point
- **`index.html`** -- HTML template (replace `%TITLE%`)
- **`package.template.json`** -- Template for example `package.json` files

---

## Getting API keys

| Provider | URL | Used by |
|----------|-----|---------|
| Anthropic | [console.anthropic.com](https://console.anthropic.com/) | Most examples (LLM) |
| Deepgram | [console.deepgram.com](https://console.deepgram.com/) | 20-24 (STT/TTS) |
| OpenAI | [platform.openai.com](https://platform.openai.com/) | 40-42 (LLM/TTS) |
| Groq | [console.groq.com](https://console.groq.com/) | 60 (LLM) |
| AssemblyAI | [assemblyai.com](https://www.assemblyai.com/) | 70 (STT) |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io/) | 80-81 (STT/TTS) |
| Cartesia | [cartesia.ai](https://cartesia.ai/) | 90 (TTS) |
| Gemini | [ai.google.dev](https://ai.google.dev/) | 100 (LLM) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/) | 110 (LLM) |

---

## Troubleshooting

**"Cannot find module '@lukeocodes/composite-voice'" or blank page**

The SDK must be compiled before examples can import it:

```bash
pnpm build
```

**Microphone permission not prompted or denied**

- Click any button on the page before speaking -- browsers require a user gesture
- If previously denied, click the lock icon in the address bar and reset the permission
- Microphone access requires `localhost` or HTTPS

**NativeSTT does nothing**

The Web Speech API is only fully supported in Chrome and Edge. Use a WebSocket STT example (20+) for browser-agnostic speech recognition.

---

## Further reading

- [Main README](../README.md) -- SDK reference, all providers, configuration, events, and proxy API
- [CONTRIBUTING.md](../CONTRIBUTING.md) -- Adding providers, running tests, submitting PRs
