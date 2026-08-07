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
pnpm example composite-voice-example-XX-name dev
```

Or navigate into the example directory:

```bash
cd examples/XX-example-name
pnpm dev
```

---

## Example index

Each row is a directory under `examples/`. Server-side examples (40-42 proxies, 80-84 platform agents) run with `pnpm start`/`pnpm dev` in the directory; everything else is a React + Vite app started with `pnpm dev`.

### Getting started (01-09)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 01 | [`01-first-voice-pipeline`](./01-first-voice-pipeline/) | The simplest possible voice pipeline using browser-native speech recognition and synthesis with Claude as the LLM |
| 02 | [`02-secure-api-keys`](./02-secure-api-keys/) | Secure API keys with Express proxy — SpeechmaticsSTT + AnthropicLLM + SpeechifyTTS via server-side key injection |
| 03 | [`03-cloud-providers`](./03-cloud-providers/) | Production-quality pipeline: Speechmatics STT + Speechify TTS + Anthropic Claude via Vite proxy |
| 04 | [`04-base-provider-options`](./04-base-provider-options/) | Demonstrates `endpoint`, `authType`, and `proxyUrl` configuration on provider instances. Toggle between `authType: 'token'` and `authType: 'bearer'` at runtime and see the resolved connection info for each provider |
| 06 | [`06-conversation-history`](./06-conversation-history/) | Demonstrates `maxTurns`, `maxTokens`, and `preserveSystemMessages` configuration. Adjust settings with sliders and inputs, then view the live conversation history array as you speak with the agent |
| 07 | [`07-eager-pipeline`](./07-eager-pipeline/) | Demonstrates the eager LLM pipeline with `eagerLLM: { enabled: true }`. The LLM starts generating speculatively on DeepgramFlux preflight signals before `speechFinal` is confirmed, reducing perceived latency by 100-300ms. The UI shows when preflight fires vs speechFinal and displays timing comparisons |
| 08 | [`08-tool-use`](./08-tool-use/) | Demonstrates LLM function calling with the `tools` config. Defines three simple tools (`get_weather`, `get_time`, `calculate`) and displays tool calls and results in the UI. After a tool executes, the LLM generates a natural-language follow-up |
| 09 | [`09-custom-logging`](./09-custom-logging/) | Demonstrates the SDK logging configuration with controls for log level and a custom logger function. SDK logs are displayed in a scrollable panel in the UI, color-coded by level |

### Speech-to-Text (10-19)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 10 | [`10-native-stt`](./10-native-stt/) | NativeSTT configuration explorer — Web Speech API + Anthropic Claude + NativeTTS |
| 11 | [`11-deepgram-stt`](./11-deepgram-stt/) | DeepgramSTT configuration explorer — Deepgram Nova + Anthropic Claude + NativeTTS |
| 12 | [`12-assemblyai-stt`](./12-assemblyai-stt/) | AssemblyAISTT configuration explorer — AssemblyAI + Anthropic Claude + NativeTTS |
| 13 | [`13-elevenlabs-stt`](./13-elevenlabs-stt/) | ElevenLabsSTT configuration explorer — ElevenLabs Scribe + Anthropic Claude + NativeTTS |
| 14 | [`14-deepgram-flux`](./14-deepgram-flux/) | DeepgramFlux (V2 STT) demo — currently disabled, shows eager pipeline concept |

### Language Models (20-29)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 20 | [`20-anthropic-llm`](./20-anthropic-llm/) | Anthropic LLM provider — NativeSTT + AnthropicLLM + NativeTTS with model/temperature/token controls |
| 21 | [`21-openai-llm`](./21-openai-llm/) | OpenAI LLM provider — NativeSTT + OpenAILLM + NativeTTS with model/temperature/token controls |
| 22 | [`22-groq-llm`](./22-groq-llm/) | Groq LLM provider — NativeSTT + GroqLLM + NativeTTS, ultra-fast inference |
| 23 | [`23-gemini-llm`](./23-gemini-llm/) | Gemini LLM provider — NativeSTT + GeminiLLM + NativeTTS with model/temperature controls |
| 24 | [`24-mistral-llm`](./24-mistral-llm/) | Mistral LLM provider — NativeSTT + MistralLLM + NativeTTS with model/temperature controls |
| 25 | [`25-webllm`](./25-webllm/) | WebLLM in-browser LLM — NativeSTT + WebLLMLLM + NativeTTS, no server needed |
| 26 | [`26-openai-compatible`](./26-openai-compatible/) | OpenAI-compatible LLM — NativeSTT + OpenAICompatibleLLM + NativeTTS, custom endpoint |

### Text-to-Speech (30-39)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 30 | [`30-native-tts`](./30-native-tts/) | Native TTS provider — NativeSTT + Anthropic Claude + NativeTTS with voice, rate, and pitch controls |
| 31 | [`31-deepgram-tts`](./31-deepgram-tts/) | Deepgram TTS provider — NativeSTT + Anthropic Claude + DeepgramTTS with voice, sampleRate, and format options |
| 32 | [`32-openai-tts`](./32-openai-tts/) | OpenAI TTS provider — NativeSTT + Anthropic Claude + OpenAI TTS with model, voice, format, and speed options |
| 33 | [`33-elevenlabs-tts`](./33-elevenlabs-tts/) | ElevenLabs TTS provider — NativeSTT + Anthropic Claude + ElevenLabs TTS with voiceId, modelId, stability, and similarityBoost |
| 34 | [`34-cartesia-tts`](./34-cartesia-tts/) | Cartesia TTS provider — NativeSTT + Anthropic Claude + Cartesia TTS with voiceId, modelId, emotions, speed, and language |

### Server proxies (40-49)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 40 | [`40-express-proxy`](./40-express-proxy/) | Express proxy with full security config — rateLimit, maxBodySize, authenticate, CORS |
| 41 | [`41-nextjs-proxy`](./41-nextjs-proxy/) | Next.js App Router proxy — createNextJsProxy with catch-all route and security config |
| 42 | [`42-node-proxy`](./42-node-proxy/) | Plain Node.js HTTP server proxy — createNodeProxy with handleRequest + attachWebSocket |

### Audio inputs & outputs (50-59)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 50 | [`50-microphone-input`](./50-microphone-input/) | Deep-dive into MicrophoneInput config — all AudioInputConfig options with real-time audio level meter |
| 51 | [`51-buffer-input`](./51-buffer-input/) | BufferInput for file/programmatic audio — upload a WAV file and feed it through the pipeline |
| 52 | [`52-browser-audio-output`](./52-browser-audio-output/) | Deep-dive into BrowserAudioOutput config — bufferSize, minBufferDuration, sampleRate, enableSmoothing |
| 53 | [`53-null-output`](./53-null-output/) | NullOutput for headless/testing scenarios — TTS events fire but no audio plays |
| 54 | [`54-event-inspector`](./54-event-inspector/) | Advanced event inspector — real-time timeline, payload display, filtering, wildcard subscriptions, queue events |
| 55 | [`55-conversation-strategies`](./55-conversation-strategies/) | Side-by-side comparison of conversation history strategies — maxTurns=3 vs maxTurns=10 |

### Advanced (60-69)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 60 | [`60-error-recovery`](./60-error-recovery/) | RecoveryOrchestrator demo — configure recovery strategy, simulate errors, track recovery attempts |
| 61 | [`61-barge-in`](./61-barge-in/) | Automatic barge-in demo — interrupt the agent mid-speech with stopSpeaking() |
| 62 | [`62-backpressure`](./62-backpressure/) | Pipeline backpressure demo — adjust maxPendingChunks and observe LLM-to-TTS throttling |
| 63 | [`63-audio-config`](./63-audio-config/) | AudioCapture internals — AudioWorklet vs ScriptProcessor detection, audio chunk stats |
| 64 | [`64-custom-provider`](./64-custom-provider/) | Build a custom LLM provider — MockLLM with canned responses, no API keys needed |
| 65 | [`65-multi-language`](./65-multi-language/) | Language switching demo — change SpeechmaticsSTT language at runtime with a selector |
| 66 | [`66-guardrails`](./66-guardrails/) | Guardrails demo — async filters between LLM output and TTS (PII redaction, pronunciation, blocklist, moderation) |

### Agent providers (70-79)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 70 | [`70-deepgram-agent`](./70-deepgram-agent/) | Deepgram Voice Agent API — single WebSocket handles STT, LLM, and TTS server-side |

### Platform inputs & outputs (80-89)

| # | Example | What it demonstrates |
|---|---------|----------------------|
| 80 | [`80-twilio-phone-agent`](./80-twilio-phone-agent/) | Phone agent on Twilio Media Streams — TwilioMediaStream + SpeechmaticsSTT + AnthropicLLM + DeepgramTTS, one pipeline per call |
| 81 | [`81-vonage-phone-agent`](./81-vonage-phone-agent/) | Phone agent on the Vonage Voice API WebSocket bridge — VonageAudioSocket + SpeechmaticsSTT + AnthropicLLM + DeepgramTTS, one pipeline per call |
| 83 | [`83-discord-voice-bot`](./83-discord-voice-bot/) | Discord voice-channel bot — DiscordVoice duplex provider with Speechmatics STT, Deepgram TTS, and Claude |
| 84 | [`84-zoom-meeting-listener`](./84-zoom-meeting-listener/) | Zoom RTMS meeting listener — live transcripts over a plain node:http webhook, with an end-of-meeting Claude summary |
| 85 | [`85-webrtc-loopback`](./85-webrtc-loopback/) | WebRTCInput + WebRTCOutput over a local RTCPeerConnection loopback — join anything WebRTC with zero platform accounts |
| 86 | [`86-google-meet-listener`](./86-google-meet-listener/) | GoogleMeetInput (Developer Preview) — transcribe a live Google Meet conference and take LLM notes, receive-only |
| 87 | [`87-teams-meeting-agent`](./87-teams-meeting-agent/) | TeamsCall duplex — a voice agent that joins a Microsoft Teams meeting via Azure Communication Services, listens, and speaks replies |

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
| Speechmatics | [portal.speechmatics.com](https://portal.speechmatics.com/) | Default STT across the examples |
| Speechify | [console.sws.speechify.com](https://console.sws.speechify.com/) | Default TTS across the examples |
| Deepgram | [console.deepgram.com](https://console.deepgram.com/) | 11, 14, 31, 70, and the stages that need streaming/raw-PCM audio (52-54, 62, 80-83) |
| OpenAI | [platform.openai.com](https://platform.openai.com/) | 40-42 (LLM/TTS) |
| Groq | [console.groq.com](https://console.groq.com/) | 60 (LLM) |
| AssemblyAI | [assemblyai.com](https://www.assemblyai.com/) | 70 (STT) |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io/) | 80-81 (STT/TTS) |
| Cartesia | [cartesia.ai](https://cartesia.ai/) | 90 (TTS) |
| Gemini | [ai.google.dev](https://ai.google.dev/) | 100 (LLM) |
| Mistral | [console.mistral.ai](https://console.mistral.ai/) | 110 (LLM) |

---

## Troubleshooting

**"Cannot find module 'composite-voice'" or blank page**

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
