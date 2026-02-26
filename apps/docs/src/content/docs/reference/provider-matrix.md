---
title: Provider Matrix
description: Every provider's products, features, and capabilities at a glance — organized by company.
order: 0
---

CompositeVoice supports 11 provider companies across 15 provider classes. This page organizes them by company so you can see everything a single vendor offers.

### Deepgram

| | STT | TTS |
|---|---|---|
| **Class** | `DeepgramSTT` | `DeepgramTTS` |
| **Transport** | WebSocket | WebSocket |
| **Streaming** | Yes | Yes |
| **Peer dependency** | `@deepgram/sdk` >=4.11.2 | `@deepgram/sdk` >=4.11.2 |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | nova-3 (V1) / flux-general-en (V2) | aura-2-thalia-en |

**STT V1 (Nova) features:** Interim results, smart formatting, auto-punctuation, speaker diarization, entity detection, keyword boosting, profanity filter, redaction (PCI/SSN), numerals conversion, VAD events, word-level timestamps, configurable endpointing, utterance buffering, multichannel transcription. Models: nova-3 (recommended), nova-3-medical, nova-2 (+ domain variants), nova (legacy).

**STT V2 (Flux) features:** Turn-based conversation model, eager end-of-turn detection (configurable thresholds: `eot_threshold` 0.5–0.9, `eager_eot_threshold` 0.3–0.9), end-of-turn timeout (`eot_timeout_ms`), keyterm support, word confidence scores. Events: `StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`, `Update`. Models: flux-general-en.

**TTS features:** Real-time streaming synthesis, linear16/mulaw/alaw encoding, configurable sample rate (8–48 kHz), word-level timing metadata.

**TTS models:** Aura 2 (recommended — 40 English voices + 10 Spanish voices), Aura 1 (legacy — 12 English voices).

**Guides:** [DeepgramSTT](/guides/stt/deepgram-stt) · [DeepgramTTS](/guides/tts/deepgram-tts) · **Examples:** [20](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline), [21](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline), [22](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options), [23](https://github.com/lukeocodes/composite-voice/tree/main/examples/23-deepgram-voices), [24](https://github.com/lukeocodes/composite-voice/tree/main/examples/24-deepgram-conversation-history)

---

### Anthropic

| | LLM |
|---|---|
| **Class** | `AnthropicLLM` |
| **Transport** | HTTP streaming (SSE) |
| **Streaming** | Yes |
| **Peer dependency** | `@anthropic-ai/sdk` >=0.67.0 |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | claude-haiku-4-5 |

**LLM features:** Streaming via SSE, system prompts extracted to top-level `system` parameter (Anthropic API convention), `maxTokens` required (default 1024), AbortSignal cancellation for the eager pipeline, temperature and topP controls.

**Models:** claude-haiku-4-5 (fastest), claude-sonnet-4-5 (balanced), claude-opus-4-5 (most capable).

**Guides:** [AnthropicLLM](/guides/llm/anthropic) · **Examples:** [00](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent), [30](https://github.com/lukeocodes/composite-voice/tree/main/examples/30-anthropic-models), [31](https://github.com/lukeocodes/composite-voice/tree/main/examples/31-anthropic-streaming-config)

---

### OpenAI

| | LLM | TTS |
|---|---|---|
| **Class** | `OpenAILLM` | `OpenAITTS` |
| **Transport** | HTTP streaming | HTTP (REST) |
| **Streaming** | Yes | No (batch synthesis) |
| **Peer dependency** | `openai` >=6.5.0 | `openai` >=6.5.0 |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | *(required)* | tts-1 |

**LLM features:** GPT model family, streaming token generation, `organizationId` for multi-org accounts, temperature/topP/maxTokens controls.

**LLM models:** gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo.

**TTS features:** 6 voices (alloy, echo, fable, onyx, nova, shimmer), quality/speed tradeoff via model selection (tts-1 fast, tts-1-hd quality), 5 output formats (mp3, opus, aac, flac, wav), speed control (0.25–4.0x), 4096 character limit per request, `baseURL` for Azure OpenAI compatibility.

**Guides:** [OpenAILLM](/guides/llm/openai) · [OpenAITTS](/guides/tts/openai-tts) · **Examples:** [40](https://github.com/lukeocodes/composite-voice/tree/main/examples/40-openai-pipeline), [41](https://github.com/lukeocodes/composite-voice/tree/main/examples/41-openai-deepgram), [42](https://github.com/lukeocodes/composite-voice/tree/main/examples/42-openai-tts-pipeline)

---

### Groq

| | LLM |
|---|---|
| **Class** | `GroqLLM` |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | `openai` >=6.5.0 |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | llama-3.3-70b-versatile |

**LLM features:** Ultra-fast LPU-based inference (lowest latency of any cloud LLM), OpenAI-compatible API, `groqApiKey` convenience alias, wide range of open-source models.

**Models:** llama-3.3-70b-versatile, mixtral-8x7b-32768, gemma2-9b-it, llama-3.1-8b-instant.

**Guides:** [GroqLLM](/guides/llm/groq) · **Examples:** [60](https://github.com/lukeocodes/composite-voice/tree/main/examples/60-groq-pipeline)

---

### Google Gemini

| | LLM |
|---|---|
| **Class** | `GeminiLLM` |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | `openai` >=6.5.0 |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | gemini-2.0-flash |

**LLM features:** OpenAI-compatible endpoint, `geminiApiKey` convenience alias, auto-configured base URL (`generativelanguage.googleapis.com/v1beta/openai`).

**Models:** gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash.

**Guides:** [GeminiLLM](/guides/llm/gemini) · **Examples:** [100](https://github.com/lukeocodes/composite-voice/tree/main/examples/100-gemini-pipeline)

---

### Mistral

| | LLM |
|---|---|
| **Class** | `MistralLLM` |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | `openai` >=6.5.0 |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | mistral-small-latest |

**LLM features:** Strong multilingual support, OpenAI-compatible API, `mistralApiKey` convenience alias.

**Models:** mistral-small-latest, mistral-medium-latest, mistral-large-latest.

**Guides:** [MistralLLM](/guides/llm/mistral) · **Examples:** [110](https://github.com/lukeocodes/composite-voice/tree/main/examples/110-mistral-pipeline)

---

### AssemblyAI

| | STT |
|---|---|
| **Class** | `AssemblyAISTT` |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | *(default real-time model)* |

**STT features:** Interim results, word boosting for domain vocabulary, word-level timestamps and confidence, automatic reconnection with exponential backoff, base64-encoded audio, graceful `terminate_session` on disconnect, configurable sample rate.

**Guides:** [AssemblyAISTT](/guides/stt/assemblyai-stt) · **Examples:** [70](https://github.com/lukeocodes/composite-voice/tree/main/examples/70-assemblyai-pipeline)

---

### ElevenLabs

| | TTS |
|---|---|
| **Class** | `ElevenLabsTTS` |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | eleven_turbo_v2_5 |

**TTS features:** Voice cloning controls (stability 0–1, similarityBoost 0–1), BOS/EOS stream-input protocol, word-level alignment, 6 output formats (pcm_16000, pcm_22050, pcm_24000, pcm_44100, mp3_44100_128, ulaw_8000), multilingual models.

**Models:** eleven_turbo_v2_5 (fast), eleven_turbo_v2, eleven_multilingual_v2, eleven_monolingual_v1.

**Guides:** [ElevenLabsTTS](/guides/tts/elevenlabs-tts) · **Examples:** [80](https://github.com/lukeocodes/composite-voice/tree/main/examples/80-elevenlabs-pipeline)

---

### Cartesia

| | TTS |
|---|---|
| **Class** | `CartesiaTTS` |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | sonic-2 |

**TTS features:** Ultra-low-latency streaming, context-based streaming (`context_id` + `continue` flag preserves prosody across chunks), emotion controls (`emotion_name:intensity` tags), speed multiplier, 4 PCM encodings (s16le, f32le, mulaw, alaw), word-level timestamps, configurable sample rate.

**Models:** sonic-2 (latest, lowest latency), sonic, sonic-multilingual.

**Guides:** [CartesiaTTS](/guides/tts/cartesia-tts) · **Examples:** [90](https://github.com/lukeocodes/composite-voice/tree/main/examples/90-cartesia-pipeline)

---

### Browser Built-ins

| | STT | TTS |
|---|---|---|
| **Class** | `NativeSTT` | `NativeTTS` |
| **Transport** | Web Speech API | SpeechSynthesis API |
| **Streaming** | Yes (interim results) | No (managed playback) |
| **Peer dependency** | None | None |
| **Proxy support** | No (no API key needed) | No (no API key needed) |
| **Browser support** | Chrome, Edge (full); Safari (limited) | All modern browsers |
| **Default model** | Browser default | OS default voice |

**STT features:** Zero dependencies, works offline, 50+ languages via browser, continuous mode, interim results, `maxAlternatives`, `startTimeout`, managed audio (browser controls the microphone directly).

**TTS features:** Zero dependencies, works offline, voice enumeration via `getAvailableVoices()`, voice selection by name/language, rate/pitch/volume controls, pause/resume/cancel playback, runtime voice switching with `setVoice()`, managed audio (browser plays directly).

**Limitations:** NativeSTT requires Chromium (no Firefox). Both use managed audio — the SDK cannot access raw audio streams. No preflight signals. Best for prototyping.

**Guides:** [NativeSTT](/guides/stt/native-stt) · [NativeTTS](/guides/tts/native-tts) · **Examples:** [00](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent)

---

### WebLLM (MLC AI)

| | LLM |
|---|---|
| **Class** | `WebLLMLLM` |
| **Transport** | WebGPU (in-browser) |
| **Streaming** | Yes |
| **Peer dependency** | `@mlc-ai/web-llm` >=0.2.74 |
| **Proxy support** | No (runs locally) |
| **Browser support** | Chrome 113+, Edge 113+ (WebGPU required) |
| **Default model** | *(required — no default)* |

**LLM features:** Fully offline after initial model download, all data stays in the browser, `onLoadProgress` callback for download UI, `chatOpts` for engine tuning, `engine.interruptGenerate()` abort support, no API keys needed.

**Example models:** Llama-3.2-1B-Instruct-q4f16_1-MLC (~500 MB), Phi-2-q4f16_1-MLC (~1.5 GB).

**Guides:** [WebLLMLLM](/guides/llm/webllm) · **Examples:** [50](https://github.com/lukeocodes/composite-voice/tree/main/examples/50-webllm-pipeline)

---

### Feature comparison at a glance

| Capability | Providers that support it |
|---|---|
| **WebSocket streaming** | DeepgramSTT, DeepgramTTS, AssemblyAISTT, ElevenLabsTTS, CartesiaTTS |
| **Preflight / eager LLM** | DeepgramSTT (Flux / STT V2 only) |
| **Server proxy** | All except NativeSTT, NativeTTS, WebLLMLLM |
| **No API key needed** | NativeSTT, NativeTTS, WebLLMLLM |
| **No peer dependency** | NativeSTT, NativeTTS, AssemblyAISTT, ElevenLabsTTS, CartesiaTTS |
| **Managed audio** | NativeSTT, NativeTTS |
| **Voice cloning controls** | ElevenLabsTTS |
| **Emotion controls** | CartesiaTTS |
| **Word boosting** | DeepgramSTT, AssemblyAISTT |
| **Offline capable** | NativeSTT, NativeTTS, WebLLMLLM |
| **Speaker diarization** | DeepgramSTT |
| **Word-level timestamps** | DeepgramSTT, AssemblyAISTT, DeepgramTTS, CartesiaTTS |
