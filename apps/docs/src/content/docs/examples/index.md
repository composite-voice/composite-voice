---
title: Examples
description: Runnable example apps covering every provider, pattern, and use case.
order: 0
---

Every example is a standalone Vite app you can run locally. Clone the repository, install dependencies, and start any example:

```bash
git clone https://github.com/lukeocodes/composite-voice.git
cd composite-voice
pnpm install
pnpm --filter 00-minimal-voice-agent dev
```

Each example runs on its own port (starting at 3000) so you can run several simultaneously.

## Foundation

| Example | Port | What it demonstrates |
|---------|------|---------------------|
| [00-minimal-voice-agent](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent) | 3000 | Simplest possible pipeline: NativeSTT + Anthropic + NativeTTS |
| [01-conversation-history](https://github.com/lukeocodes/composite-voice/tree/main/examples/01-conversation-history) | 3001 | Multi-turn conversation with configurable turn limit |
| [02-system-persona](https://github.com/lukeocodes/composite-voice/tree/main/examples/02-system-persona) | 3002 | Switch personas (assistant, tech expert, storyteller, pirate) at runtime |
| [03-event-inspector](https://github.com/lukeocodes/composite-voice/tree/main/examples/03-event-inspector) | 3003 | Real-time event timeline with category filtering — a developer debugging tool |
| [04-error-recovery](https://github.com/lukeocodes/composite-voice/tree/main/examples/04-error-recovery) | 3004 | Simulate errors and watch auto-recovery in action |
| [05-turn-taking](https://github.com/lukeocodes/composite-voice/tree/main/examples/05-turn-taking) | 3005 | Compare turn-taking strategies (conservative, aggressive, detect) |

## Server and deployment

| Example | Port | What it demonstrates |
|---------|------|---------------------|
| [10-proxy-server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) | 3010 | Express server proxy — keep API keys server-side |
| [11-nextjs-proxy](https://github.com/lukeocodes/composite-voice/tree/main/examples/11-nextjs-proxy) | 3011 | Next.js App Router proxy for production deployment |
| [12-custom-provider](https://github.com/lukeocodes/composite-voice/tree/main/examples/12-custom-provider) | 3012 | Build a custom LLM provider — zero API keys, fully offline |
| [13-multi-language](https://github.com/lukeocodes/composite-voice/tree/main/examples/13-multi-language) | 3013 | Switch languages mid-session without reinitializing |

## Deepgram pipelines

| Example | Port | What it demonstrates |
|---------|------|---------------------|
| [20-deepgram-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) | 3020 | Full Deepgram pipeline: nova-3 STT + Anthropic + aura-2 TTS |
| [21-eager-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline) | 3021 | Eager/preflight pipeline for sub-second latency |
| [22-deepgram-options](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options) | 3022 | Tune STT options: model, VAD, endpointing, profanity filter |
| [23-deepgram-voices](https://github.com/lukeocodes/composite-voice/tree/main/examples/23-deepgram-voices) | 3023 | Browse and preview all Aura 2 TTS voices |
| [24-deepgram-conversation-history](https://github.com/lukeocodes/composite-voice/tree/main/examples/24-deepgram-conversation-history) | 3024 | Production pipeline: Deepgram STT/TTS + Anthropic + conversation history |

## Provider showcases

| Example | Port | Stack |
|---------|------|-------|
| [30-anthropic-models](https://github.com/lukeocodes/composite-voice/tree/main/examples/30-anthropic-models) | 3030 | Compare Haiku, Sonnet, and Opus side by side |
| [31-anthropic-streaming-config](https://github.com/lukeocodes/composite-voice/tree/main/examples/31-anthropic-streaming-config) | 3031 | Tune temperature, maxTokens, and topP in real time |
| [40-openai-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/40-openai-pipeline) | 3040 | NativeSTT + OpenAI GPT + NativeTTS |
| [41-openai-deepgram](https://github.com/lukeocodes/composite-voice/tree/main/examples/41-openai-deepgram) | 3041 | OpenAI GPT + Deepgram STT/TTS |
| [42-openai-tts-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/42-openai-tts-pipeline) | 3042 | OpenAI GPT + OpenAI TTS |
| [50-webllm-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/50-webllm-pipeline) | 3050 | Fully offline: NativeSTT + WebLLM (in-browser) + NativeTTS |
| [60-groq-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/60-groq-pipeline) | 3060 | Deepgram STT + Groq (ultra-fast) + Deepgram TTS |
| [70-assemblyai-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/70-assemblyai-pipeline) | 3070 | AssemblyAI STT + Anthropic + Deepgram TTS |
| [80-elevenlabs-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/80-elevenlabs-pipeline) | 3080 | Deepgram STT + Anthropic + ElevenLabs TTS |
| [90-cartesia-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/90-cartesia-pipeline) | 3090 | Deepgram STT + Groq + Cartesia TTS |
| [100-gemini-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/100-gemini-pipeline) | 3100 | Deepgram STT + Gemini + ElevenLabs TTS |
| [110-mistral-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/110-mistral-pipeline) | 3110 | Deepgram STT + Mistral + ElevenLabs TTS |

## Recommended starting points

**New to the SDK?** Start with [00-minimal-voice-agent](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent) — it uses browser-native providers and requires only an Anthropic API key.

**Building for production?** Jump to [20-deepgram-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline) for cloud-grade STT and TTS, then add [10-proxy-server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) for secure key management.

**Privacy-sensitive use case?** See [50-webllm-pipeline](https://github.com/lukeocodes/composite-voice/tree/main/examples/50-webllm-pipeline) — everything runs in the browser with no data leaving the device.
