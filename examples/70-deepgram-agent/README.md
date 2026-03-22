# 70 — Deepgram Agent

Single-WebSocket voice agent powered by the [Deepgram Voice Agent API](https://developers.deepgram.com/docs/voice-agent). One `DeepgramAgent` provider replaces the entire STT + LLM + TTS pipeline — Deepgram handles everything server-side.

## What it shows

- `DeepgramAgent` covers `stt`, `llm`, and `tts` roles in a single provider
- The SDK auto-fills `MicrophoneInput` and `BrowserAudioOutput` for audio I/O
- Server-side LLM (OpenAI GPT-4o-mini) and TTS (Aura 2) configured via the `think` and `speak` blocks
- Client-side function calling via `onFunctionCall`
- Agent greeting on session start

## Run

```bash
# From repo root
cp sample.env .env   # Add your DEEPGRAM_API_KEY
pnpm install
pnpm build
cd examples/70-deepgram-agent
pnpm dev             # http://localhost:3070
```

## Key code

```typescript
new DeepgramAgent({
  proxyUrl: '/proxy/deepgramAgent',
  think: {
    provider: { type: 'open_ai', model: 'gpt-4o-mini' },
    prompt: 'You are a friendly voice assistant.',
  },
  speak: {
    provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
  },
  greeting: 'Hello! How can I help you today?',
})
```

Only a Deepgram API key is needed — the Agent API handles LLM and TTS provider credentials server-side.
