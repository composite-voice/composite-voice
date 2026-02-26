---
title: Providers
description: Every STT, LLM, and TTS provider — supported models, transport, features, and configuration.
order: 1
---

CompositeVoice uses three provider slots — **STT** (speech-to-text), **LLM** (large language model), and **TTS** (text-to-speech). Mix and match any combination to build your voice pipeline.

## Speech-to-Text (STT)

| Provider | Transport | Models | Interim Results | Preflight |
|---|---|---|---|---|
| NativeSTT | Browser API | Browser default | Yes | No |
| DeepgramSTT | WebSocket | V1: nova-3, nova-2 | Yes | No |
| DeepgramFlux | WebSocket | V2: flux-general-en | Yes | Yes |
| AssemblyAISTT | WebSocket | Default model | Yes | No |

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

> Does not support preflight/eager end-of-turn signals. For the eager LLM pipeline, use [DeepgramFlux](/api/classes/deepgramflux).

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

---

## Large Language Models (LLM)

| Provider | Base | Default Model | Streaming |
|---|---|---|---|
| AnthropicLLM | Custom | claude-haiku-4-5 | Yes |
| OpenAILLM | OpenAI-compatible | (required) | Yes |
| GroqLLM | OpenAI-compatible | llama-3.3-70b-versatile | Yes |
| MistralLLM | OpenAI-compatible | mistral-small-latest | Yes |
| GeminiLLM | OpenAI-compatible | gemini-2.0-flash | Yes |
| WebLLMLLM | Custom | (required) | Yes |
| OpenAICompatibleLLM | -- | (required) | Yes |

### AnthropicLLM

Claude models via the Anthropic API. Uses a dedicated SDK (not OpenAI-compatible).

```typescript
import { AnthropicLLM } from '@lukeocodes/composite-voice';

const llm = new AnthropicLLM({
  proxyUrl: '/api/proxy/anthropic',
  model: 'claude-haiku-4-5',    // claude-haiku-4-5, claude-sonnet-4-5, claude-opus-4-5
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
  baseURL: 'https://my-model-server.example.com/v1',
  model: 'my-custom-model',
  apiKey: '...',
});
```

[API reference](/api/classes/openaicompatiblellm)

---

## Text-to-Speech (TTS)

| Provider | Transport | Voices | Streaming | Audio Format |
|---|---|---|---|---|
| NativeTTS | Browser API | System voices | No (managed) | N/A |
| DeepgramTTS | WebSocket | Aura 2 (7 voices) | Yes | linear16, mulaw, alaw |
| OpenAITTS | REST | 6 voices | No | mp3, opus, aac, flac, wav |
| ElevenLabsTTS | WebSocket | Custom voice IDs | Yes | pcm, mp3, ulaw |
| CartesiaTTS | WebSocket | Custom voice IDs | Yes | pcm (s16le, f32le, mulaw, alaw) |

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

---

## Choosing providers

**For prototyping:** NativeSTT + any LLM + NativeTTS -- no API keys except the LLM.

**For production:** DeepgramSTT + AnthropicLLM + DeepgramTTS (or ElevenLabsTTS / CartesiaTTS) -- best accuracy, lowest latency, streaming throughout.

**For privacy:** NativeSTT + WebLLMLLM + NativeTTS -- everything runs in the browser. No data leaves the device.

**For lowest latency:** DeepgramFlux + GroqLLM + CartesiaTTS -- eager end-of-turn signals, fastest LLM inference, low-latency streaming TTS.
