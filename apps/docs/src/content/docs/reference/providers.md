---
title: Providers
description: Every input, STT, LLM, TTS, and output provider — supported models, transport, features, and configuration.
order: 1
---

CompositeVoice uses five pipeline roles — **input** (audio capture), **STT** (speech-to-text), **LLM** (large language model), **TTS** (text-to-speech), and **output** (audio playback). Mix and match any combination to build your voice pipeline. Some providers cover multiple roles (e.g., NativeSTT handles both `input` and `stt`).

## Audio Input

| Provider | Environment | Roles | Description |
|---|---|---|---|
| [MicrophoneInput](#microphoneinput) | Browser | `input` | Wraps `getUserMedia` + `AudioContext` for microphone capture |
| [BufferInput](#bufferinput) | Node/Bun/Deno | `input` | Accepts pushed `ArrayBuffer` data for server-side pipelines |
| [NativeSTT](#nativestt) | Browser | `input` + `stt` | Browser's Web Speech API manages its own microphone internally |

### MicrophoneInput

Captures audio from the browser's microphone via `getUserMedia` and `AudioContext`. Use this when pairing with a WebSocket-based STT provider like DeepgramSTT or AssemblyAISTT.

```typescript
import { MicrophoneInput } from '@lukeocodes/composite-voice';

const input = new MicrophoneInput({
  sampleRate: 16000,        // audio sample rate in Hz
});
```

- Buffers audio frames in the input queue during STT connection — no audio is ever lost
- Works in all modern browsers that support `getUserMedia`
- Requires HTTPS or localhost

### BufferInput

Accepts audio data pushed programmatically. Use this for server-side pipelines (Node.js, Bun, Deno) where there is no microphone.

```typescript
import { BufferInput } from '@lukeocodes/composite-voice';

const input = new BufferInput({
  sampleRate: 16000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
});

// Push audio from any source (file, stream, WebSocket, etc.)
input.push(audioBuffer);
```

- Zero browser dependencies — no `navigator`, `window`, or `AudioContext`
- Works in Node.js, Bun, and Deno

---

## Speech-to-Text (STT)

| Provider | Transport | Models | Interim Results | Preflight |
|---|---|---|---|---|
| [NativeSTT](/guides/stt/native-stt) | Browser API | Browser default | Yes | No |
| [DeepgramSTT](/guides/stt/deepgram-stt) | WebSocket | V1: nova-3, nova-2 | Yes | No |
| [DeepgramFlux](/guides/stt/deepgram-flux) | WebSocket | V2: flux-general-en | Yes | Yes |
| [AssemblyAISTT](/guides/stt/assemblyai-stt) | WebSocket | Default model | Yes | No |
| [ElevenLabsSTT](/guides/stt/elevenlabs-stt) | WebSocket | scribe_v2_realtime | Yes | No |
| [SonioxSTT](/guides/stt/soniox-stt) | WebSocket | stt-rt-v5 | Yes | No |
| [GladiaSTT](/guides/stt/gladia-stt) | HTTP init + WebSocket | solaria-1 | Yes | No |

### NativeSTT

Uses the browser's built-in Web Speech API. Zero API keys required. Best for prototyping and demos.

```typescript
import { NativeSTT } from '@lukeocodes/composite-voice';

const stt = new NativeSTT({
  language: 'en-US',        // BCP 47 language tag
  continuous: true,          // keep listening after each result
  interimResults: true,      // emit partial transcripts
  maxAlternatives: 1,        // number of recognition alternatives
});
```

- No API key needed
- Works offline
- Supports 50+ languages via the browser
- Managed audio — the browser controls the microphone directly
- **Does not work in de-Googled browsers** (Ungoogled Chromium, Brave) — the Web Speech API requires Google's speech servers

[API reference](/api/classes/nativestt)

### DeepgramSTT

Production-grade real-time speech recognition via WebSocket using Deepgram's V1 (Nova) API. Best accuracy across the widest range of languages.

```typescript
import { DeepgramSTT } from '@lukeocodes/composite-voice';

const stt = new DeepgramSTT({
  proxyUrl: '/api/proxy/deepgram',   // server proxy (recommended)
  // OR: apiKey: 'dg-...',           // direct API key (dev only)
  language: 'en',
  interimResults: true,
  options: {
    model: 'nova-3',          // nova-3 (recommended), nova-2, nova-3-medical
    smartFormat: true,         // auto-punctuation and formatting
    punctuation: true,
    profanityFilter: false,
    diarize: false,            // speaker identification
    endpointing: 300,          // ms of silence before end-of-speech
    utteranceEndMs: 1000,      // ms before utterance boundary
  },
});
```

- nova-3 (highest accuracy, recommended default), nova-2 (wider language support)
- Word-level confidence and timestamps
- Smart formatting and auto-punctuation
- Profanity filtering
- Speaker diarization
- VAD events

> Does not support preflight/eager end-of-turn signals. For the eager LLM pipeline, use [DeepgramFlux](/guides/stt/deepgram-flux).

[API reference](/api/classes/deepgramstt)

### DeepgramFlux

Low-latency real-time speech recognition via WebSocket using Deepgram's V2 (Flux) API. Supports eager end-of-turn signals for the [eager LLM pipeline](/advanced/pipeline#eager-llm-pipeline).

```typescript
import { DeepgramFlux } from '@lukeocodes/composite-voice';

const stt = new DeepgramFlux({
  proxyUrl: '/api/proxy/deepgram',   // server proxy (recommended)
  // OR: apiKey: 'dg-...',           // direct API key (dev only)
  options: {
    model: 'flux-general-en',
    eagerEotThreshold: 0.5,    // enables eager end-of-turn signals
    eotThreshold: 0.7,
  },
});
```

- Turn-based transcription via `TurnInfo` events
- Eager end-of-turn signals (`EagerEndOfTurn` → `isPreflight: true`)
- Configurable end-of-turn confidence thresholds
- Keyterm boosting for domain vocabulary
- **Only STT provider that supports the eager LLM pipeline**

[API reference](/api/classes/deepgramflux)

### AssemblyAISTT

Real-time speech recognition via WebSocket with word boosting for domain-specific vocabulary.

```typescript
import { AssemblyAISTT } from '@lukeocodes/composite-voice';

const stt = new AssemblyAISTT({
  proxyUrl: '/api/proxy/assemblyai',
  // OR: apiKey: '...',
  sampleRate: 16000,
  language: 'en',
  wordBoost: ['CompositeVoice', 'WebSocket'],  // boost domain terms
});
```

- Word boosting for domain vocabulary
- Word-level timestamps and confidence
- Automatic reconnection

[API reference](/api/classes/assemblyaistt)

### ElevenLabsSTT

Real-time speech recognition via WebSocket using ElevenLabs Scribe V2 with ~150ms latency and 90+ language support.

```typescript
import { ElevenLabsSTT } from '@lukeocodes/composite-voice';

const stt = new ElevenLabsSTT({
  proxyUrl: '/api/proxy/elevenlabs',
  // OR: apiKey: '...',
  // OR: token: '...',             // single-use token
  model: 'scribe_v2_realtime',
  audioFormat: 'pcm_16000',
  language: 'en',                  // BCP 47, ISO 639-1, or ISO 639-3
  commitStrategy: 'vad',           // 'vad' (default) or 'manual'
  includeTimestamps: true,         // word-level timestamps
});
```

- VAD and manual commit strategies
- 90+ languages with auto-detection
- Word-level timestamps and confidence
- Three auth methods (API key, proxy, single-use token)
- Shares proxy config with ElevenLabsTTS

[API reference](/api/classes/elevenlabsstt)

### SonioxSTT

Real-time multilingual speech recognition via WebSocket with built-in endpoint detection for turn-taking.

```typescript
import { SonioxSTT } from '@lukeocodes/composite-voice';

const stt = new SonioxSTT({
  proxyUrl: '/api/proxy/soniox',
  // OR: apiKey: '...',              // direct or async temporary-key factory
  model: 'stt-rt-v5',
  audioFormat: 'pcm_s16le',
  sampleRate: 16000,
  languageHints: ['en', 'es'],       // bias recognition
  enableEndpointDetection: true,      // default — drives turn-taking
  enableSpeakerDiarization: false,
});
```

- 60+ languages with automatic detection
- Endpoint detection finalizes utterances when the speaker stops
- Speaker diarization and per-token language identification
- Domain context for specialized vocabulary
- Temporary API key support via async `apiKey` factories

[API reference](/api/classes/sonioxstt)

### GladiaSTT

Real-time speech recognition via Gladia's v2 live API (Solaria models) with configurable server-side endpointing for turn-taking.

```typescript
import { GladiaSTT } from '@lukeocodes/composite-voice';

const stt = new GladiaSTT({
  proxyUrl: '/api/proxy/gladia',
  // OR: apiKey: '...',              // direct API key (dev only)
  model: 'solaria-1',
  encoding: 'wav/pcm',
  sampleRate: 16000,
  languages: ['en'],                 // pin or restrict language detection
  endpointing: 0.3,                  // seconds of silence before finalizing
  codeSwitching: false,              // re-detect language per utterance
});
```

- HTTP session init (`POST /v2/live`) + direct WebSocket streaming
- Server-side endpointing finalizes utterances when the speaker stops
- Language pinning and per-utterance code switching
- Word-level timestamps and confidence on final results
- Session token embedded in the WebSocket URL — reconnects resume the session

[API reference](/api/classes/gladiastt)

---

## Large Language Models (LLM)

| Provider | Base | Default Model | Streaming |
|---|---|---|---|
| [AnthropicLLM](/guides/llm/anthropic) | Custom | claude-haiku-4-5 | Yes |
| [OpenAILLM](/guides/llm/openai) | OpenAI-compatible | (required) | Yes |
| [GroqLLM](/guides/llm/groq) | OpenAI-compatible | llama-3.3-70b-versatile | Yes |
| [MistralLLM](/guides/llm/mistral) | OpenAI-compatible | mistral-small-latest | Yes |
| [GeminiLLM](/guides/llm/gemini) | OpenAI-compatible | gemini-2.0-flash | Yes |
| [WebLLMLLM](/guides/llm/webllm) | Custom | (required) | Yes |
| [OpenAICompatibleLLM](/guides/llm/openai-compatible) | -- | (required) | Yes |

### AnthropicLLM

Claude models via the Anthropic API. Uses a dedicated SDK (not OpenAI-compatible).

```typescript
import { AnthropicLLM } from '@lukeocodes/composite-voice';

const llm = new AnthropicLLM({
  proxyUrl: '/api/proxy/anthropic',
  model: 'claude-haiku-4-5',    // claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6
  maxTokens: 1024,               // required (default: 1024)
});
```

- System prompts at top level (Anthropic API convention)
- Streaming via SSE
- AbortSignal cancellation for the eager pipeline

[API reference](/api/classes/anthropicllm)

### OpenAILLM

GPT models via the OpenAI API.

```typescript
import { OpenAILLM } from '@lukeocodes/composite-voice';

const llm = new OpenAILLM({
  proxyUrl: '/api/proxy/openai',
  model: 'gpt-4o-mini',
  // organizationId: 'org-...',  // for multi-org accounts
});
```

[API reference](/api/classes/openaillm)

### GroqLLM

Ultra-fast inference on Groq's LPU hardware. Supports open-source models.

```typescript
import { GroqLLM } from '@lukeocodes/composite-voice';

const llm = new GroqLLM({
  proxyUrl: '/api/proxy/groq',
  model: 'llama-3.3-70b-versatile',  // or mixtral-8x7b-32768, gemma2-9b-it
});
```

- Lowest latency of any cloud LLM provider
- Wide range of open-source models

[API reference](/api/classes/groqllm)

### MistralLLM

Mistral models with strong multilingual support.

```typescript
import { MistralLLM } from '@lukeocodes/composite-voice';

const llm = new MistralLLM({
  proxyUrl: '/api/proxy/mistral',
  model: 'mistral-small-latest',  // or mistral-medium-latest, mistral-large-latest
});
```

[API reference](/api/classes/mistralllm)

### GeminiLLM

Google Gemini models via their OpenAI-compatible endpoint.

```typescript
import { GeminiLLM } from '@lukeocodes/composite-voice';

const llm = new GeminiLLM({
  proxyUrl: '/api/proxy/gemini',
  model: 'gemini-2.0-flash',  // or gemini-1.5-pro, gemini-1.5-flash
});
```

[API reference](/api/classes/geminillm)

### WebLLMLLM

Run LLMs entirely in the browser via WebGPU. No API keys, no network, full privacy.

```typescript
import { WebLLMLLM } from '@lukeocodes/composite-voice';

const llm = new WebLLMLLM({
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  onLoadProgress: (progress) => {
    console.log(`Loading: ${(progress.progress * 100).toFixed(0)}%`);
  },
});
```

- All data stays in the browser
- Works offline after initial model download
- Requires a WebGPU-capable browser
- First load downloads model weights (100+ MB)

[API reference](/api/classes/webllmllm)

### OpenAICompatibleLLM

Base class for any service that speaks the OpenAI chat completions format. Use this to connect custom or self-hosted models.

```typescript
import { OpenAICompatibleLLM } from '@lukeocodes/composite-voice';

const llm = new OpenAICompatibleLLM({
  endpoint: 'https://my-model-server.example.com/v1',
  model: 'my-custom-model',
  apiKey: '...',
});
```

[API reference](/api/classes/openaicompatiblellm)

---

## Text-to-Speech (TTS)

| Provider | Transport | Voices | Streaming | Audio Format |
|---|---|---|---|---|
| [NativeTTS](/guides/tts/native-tts) | Browser API | System voices | No (managed) | N/A |
| [DeepgramTTS](/guides/tts/deepgram-tts) | WebSocket | Aura 2 (7 voices) | Yes | linear16, mulaw, alaw |
| [OpenAITTS](/guides/tts/openai-tts) | REST | 6 voices | No | mp3, opus, aac, flac, wav |
| [ElevenLabsTTS](/guides/tts/elevenlabs-tts) | WebSocket | Custom voice IDs | Yes | pcm, mp3, ulaw |
| [CartesiaTTS](/guides/tts/cartesia-tts) | WebSocket | Custom voice IDs | Yes | pcm (s16le, f32le, mulaw, alaw) |
| [SpeechifyTTS](/guides/tts/speechify-tts) | REST | Catalog + cloned voice IDs | No | mp3, wav, ogg, aac |
| [MurfTTS](/guides/tts/murf-tts) | REST | Murf voice library (`en-US-natalie`, ...) | No | mp3, wav, flac, alaw, ulaw |
| [LMNTTTS](/guides/tts/lmnt-tts) | REST | Catalog + cloned voice IDs | No | mp3, wav, aac, ulaw, webm, pcm |
| [SmallestTTS](/guides/tts/smallest-tts) | REST | Catalog + cloned voice IDs | No | wav, mp3, pcm, ulaw, alaw |

### NativeTTS

Uses the browser's built-in SpeechSynthesis API. Zero API keys required.

```typescript
import { NativeTTS } from '@lukeocodes/composite-voice';

const tts = new NativeTTS({
  voiceName: 'Samantha',    // partial match against available voices
  voiceLang: 'en-US',       // BCP 47 fallback filter
  rate: 1.0,                // speech rate
  pitch: 0,                 // semitones (-20 to 20)
});
```

- No API key needed
- Works offline
- Managed audio — the browser plays directly
- Supports pause, resume, and cancel
- Voice enumeration via `getAvailableVoices()`

[API reference](/api/classes/nativetts)

### DeepgramTTS

Low-latency real-time streaming TTS via WebSocket with Aura 2 voices.

```typescript
import { DeepgramTTS } from '@lukeocodes/composite-voice';

const tts = new DeepgramTTS({
  proxyUrl: '/api/proxy/deepgram',
  voice: 'aura-2-thalia-en',    // thalia, andromeda, janus, proteus, orion, luna, arcas
  sampleRate: 24000,
  outputFormat: 'linear16',
});
```

- Lowest latency streaming TTS
- Word-level timing metadata
- Aura 2 voice models

[API reference](/api/classes/deepgramtts)

### OpenAITTS

OpenAI text-to-speech via REST. Returns complete audio in one request.

```typescript
import { OpenAITTS } from '@lukeocodes/composite-voice';

const tts = new OpenAITTS({
  proxyUrl: '/api/proxy/openai',
  model: 'tts-1',          // tts-1 (fast) or tts-1-hd (quality)
  voice: 'nova',           // alloy, echo, fable, onyx, nova, shimmer
  responseFormat: 'mp3',   // mp3, opus, aac, flac, wav
  speed: 1.0,              // 0.25 to 4.0
});
```

- Six distinct voices
- Quality/speed tradeoff via model selection
- 4096 character limit per request

[API reference](/api/classes/openaitts)

### ElevenLabsTTS

High-quality voice cloning and synthesis via WebSocket streaming.

```typescript
import { ElevenLabsTTS } from '@lukeocodes/composite-voice';

const tts = new ElevenLabsTTS({
  proxyUrl: '/api/proxy/elevenlabs',
  voiceId: 'your-voice-id',           // from ElevenLabs dashboard
  modelId: 'eleven_turbo_v2_5',       // turbo_v2_5, turbo_v2, multilingual_v2
  stability: 0.5,                      // voice consistency (0-1)
  similarityBoost: 0.75,              // voice fidelity (0-1)
  outputFormat: 'pcm_16000',          // pcm_16000, pcm_22050, pcm_24000, mp3_44100_128
});
```

- Voice cloning
- Multilingual models
- Stability and similarity controls
- Multiple output formats

[API reference](/api/classes/elevenlabstts)

### CartesiaTTS

Ultra-low-latency streaming TTS with emotion controls.

```typescript
import { CartesiaTTS } from '@lukeocodes/composite-voice';

const tts = new CartesiaTTS({
  proxyUrl: '/api/proxy/cartesia',
  voiceId: 'your-voice-id',
  modelId: 'sonic-2',           // sonic-2 (latest), sonic, sonic-multilingual
  language: 'en',
  outputEncoding: 'pcm_s16le',
  outputSampleRate: 16000,
  speed: 'normal',              // or 'slow', 'fast'
  emotion: ['positivity:high'], // emotion tags
});
```

- Context-based streaming links chunks into coherent utterances
- Emotion controls
- Word-level timestamps
- sonic-2 model delivers the lowest latency

[API reference](/api/classes/cartesiatts)

### SpeechifyTTS

Speechify Simba text-to-speech via REST. Returns complete audio in one request.

```typescript
import { SpeechifyTTS } from '@lukeocodes/composite-voice';

const tts = new SpeechifyTTS({
  proxyUrl: '/api/proxy/speechify',
  voiceId: 'geffen_32',        // from GET /v1/voices or a cloned voice
  model: 'simba-3.2',          // simba-english, simba-multilingual, simba-3.0, simba-3.2
  audioFormat: 'mp3',          // mp3, wav, ogg, aac
  language: 'en-US',           // optional; auto-detected when omitted
});
```

- Catalog voices and instant voice cloning
- English and multilingual Simba models
- Emotion, pitch, and speed via SSML `<prosody>` tags in the input

[API reference](/api/classes/speechifytts)

### MurfTTS

Murf AI Gen2 text-to-speech via REST. Returns complete audio in one request.

```typescript
import { MurfTTS } from '@lukeocodes/composite-voice';

const tts = new MurfTTS({
  proxyUrl: '/api/proxy/murf',
  voiceId: 'en-US-natalie',    // from GET /v1/speech/voices
  format: 'mp3',               // mp3, wav, flac, alaw, ulaw
  style: 'Conversational',     // per-voice speaking styles
  rate: 0,                     // -50 to 50
  pitch: 0,                    // -50 to 50
  variation: 1,                // 0 to 5 — prosody variation
});
```

- Gen2 model with natural, studio-quality voices
- Per-voice speaking styles (Conversational, Promo, ...)
- Rate, pitch, and prosody variation controls
- Multilingual voices via the `locale` option

[API reference](/api/classes/murftts)

### LMNTTTS

LMNT Blizzard text-to-speech via REST. Returns complete audio in one request.

```typescript
import { LMNTTTS } from '@lukeocodes/composite-voice';

const tts = new LMNTTTS({
  proxyUrl: '/api/proxy/lmnt',
  voice: 'leah',           // from GET /v1/ai/voice/list or a cloned voice
  model: 'blizzard',       // LMNT's current speech model
  format: 'mp3',           // mp3, wav, aac, ulaw, webm, pcm_s16le, pcm_f32le
  language: 'en',          // optional; auto-detected when omitted
  temperature: 0.7,        // expressiveness (lower = more neutral)
  topP: 0.9,               // stability (lower = more consistent)
});
```

- Catalog voices and instant voice cloning
- 31 languages via the Blizzard model
- Expressiveness (`temperature`) and stability (`topP`) controls

[API reference](/api/classes/lmnttts)

### SmallestTTS

Smallest.ai Lightning text-to-speech via the Waves REST API. Returns complete audio in one request.

```typescript
import { SmallestTTS } from '@lukeocodes/composite-voice';

const tts = new SmallestTTS({
  proxyUrl: '/api/proxy/smallest',
  voiceId: 'meher',            // Waves catalog voice or a cloned voice
  model: 'lightning_v3.1',     // lightning_v3.1, lightning_v3.1_pro
  outputFormat: 'wav',         // wav, mp3, pcm, ulaw, alaw
  sampleRate: 24000,           // 8000, 16000, 24000, 44100
  speed: 1.0,                  // 0.5 to 2.0
});
```

- Ultra-low-latency Lightning v3.1 and v3.1 Pro models
- 12 languages (English, Hindi, Spanish, and 9 Indian languages) plus voice cloning
- Telephony-friendly ulaw/alaw output at 8 kHz

[API reference](/api/classes/smallesttts)

---

## Agent Providers

Agent providers collapse the STT + LLM + TTS pipeline into a single persistent connection. Instead of configuring three separate providers, you configure one agent provider that covers all three roles. The SDK auto-fills `MicrophoneInput` and `BrowserAudioOutput` for the remaining `input` and `output` roles.

| Provider | Transport | Roles | Description |
|---|---|---|---|
| [DeepgramAgent](#deepgramagent) | WebSocket | `stt` + `llm` + `tts` | Deepgram Voice Agent API -- single WebSocket handles STT, LLM, and TTS server-side |

### DeepgramAgent

Connects to the Deepgram Voice Agent API via a single WebSocket. Deepgram handles speech recognition, LLM inference, and text-to-speech synthesis server-side -- the client only sends raw audio and receives raw audio back.

```typescript
import { CompositeVoice, DeepgramAgent } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramAgent({
      proxyUrl: '/api/proxy/deepgram-agent',
      think: {
        provider: { type: 'open_ai', model: 'gpt-4o-mini' },
        prompt: 'You are a helpful voice assistant.',
      },
      speak: {
        provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
      },
      greeting: 'Hello! How can I help you?',
    }),
  ],
});
```

- Covers `stt` + `llm` + `tts` -- only 1 provider needed (SDK auto-fills `MicrophoneInput` + `BrowserAudioOutput`)
- Configurable LLM: OpenAI, Anthropic, Google, Groq, AWS Bedrock
- Configurable TTS: Deepgram, ElevenLabs, Cartesia, OpenAI, AWS Polly
- Mid-session updates: `updatePrompt()`, `updateSpeak()`, `updateThink()`
- Message injection: `injectUserMessage()`, `injectAgentMessage()`
- Client-side and server-side function calling via `onFunctionCall` callback
- Greeting message on session start
- Barge-in support
- Latency metrics via `AgentStartedSpeaking` events

---

## Audio Output

| Provider | Environment | Roles | Description |
|---|---|---|---|
| [BrowserAudioOutput](#browseraudiooutput) | Browser | `output` | Wraps `AudioContext` for speaker playback |
| [NullOutput](#nulloutput) | Node/Bun/Deno | `output` | Silently discards audio for server-side pipelines |
| [NativeTTS](#nativetts) | Browser | `tts` + `output` | Browser's SpeechSynthesis API manages its own speaker output |

### BrowserAudioOutput

Plays audio through the browser's `AudioContext` and speakers. Use this when pairing with a WebSocket-based or REST-based TTS provider like DeepgramTTS, ElevenLabsTTS, or OpenAITTS.

```typescript
import { BrowserAudioOutput } from '@lukeocodes/composite-voice';

const output = new BrowserAudioOutput();
```

- Handles `AudioContext` resumption after user gestures
- Buffers audio frames in the output queue during setup — no audio is ever lost

### NullOutput

Silently discards all audio. Use this for server-side pipelines where there are no speakers.

```typescript
import { NullOutput } from '@lukeocodes/composite-voice';

const output = new NullOutput();
```

- Zero browser dependencies — no `navigator`, `window`, or `AudioContext`
- Works in Node.js, Bun, and Deno

---

## Choosing providers

**For prototyping:** [NativeSTT](/guides/stt/native-stt) + any LLM + [NativeTTS](/guides/tts/native-tts) -- no API keys except the LLM.

**For production:** [DeepgramSTT](/guides/stt/deepgram-stt) + [AnthropicLLM](/guides/llm/anthropic) + [DeepgramTTS](/guides/tts/deepgram-tts) -- best accuracy, lowest latency, streaming throughout.

**For privacy:** [NativeSTT](/guides/stt/native-stt) + [WebLLMLLM](/guides/llm/webllm) + [NativeTTS](/guides/tts/native-tts) -- everything runs in the browser. No data leaves the device.

**For lowest latency:** [DeepgramFlux](/guides/stt/deepgram-flux) + [GroqLLM](/guides/llm/groq) + [DeepgramTTS](/guides/tts/deepgram-tts) -- eager end-of-turn signals, fastest LLM inference, low-latency streaming TTS.

**For simplest config:** [DeepgramAgent](#deepgramagent) -- one provider replaces the entire STT + LLM + TTS pipeline. Deepgram handles everything server-side.
