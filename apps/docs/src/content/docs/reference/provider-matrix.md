---
title: Provider Matrix
description: Every provider's products, features, and capabilities at a glance — organized by company.
order: 0
---

CompositeVoice supports 11 provider companies across 17 provider classes, plus 5 input/output providers for the 5-role pipeline. This page organizes them by company so you can see everything a single vendor offers.

### Pipeline Role Matrix

Every provider and the pipeline role(s) it fills. Multi-role providers cover two adjacent stages — use them for simpler configs (3 providers instead of 5).

| Provider | `input` | `stt` | `llm` | `tts` | `output` |
|---|:---:|:---:|:---:|:---:|:---:|
| **MicrophoneInput** | **yes** | | | | |
| **BufferInput** | **yes** | | | | |
| **NativeSTT** | **yes** | **yes** | | | |
| **DeepgramSTT** | | **yes** | | | |
| **DeepgramFlux** | | **yes** | | | |
| **AssemblyAISTT** | | **yes** | | | |
| **ElevenLabsSTT** | | **yes** | | | |
| **AnthropicLLM** | | | **yes** | | |
| **OpenAILLM** | | | **yes** | | |
| **GroqLLM** | | | **yes** | | |
| **GeminiLLM** | | | **yes** | | |
| **MistralLLM** | | | **yes** | | |
| **WebLLMLLM** | | | **yes** | | |
| **OpenAICompatibleLLM** | | | **yes** | | |
| **NativeTTS** | | | | **yes** | **yes** |
| **DeepgramTTS** | | | | **yes** | |
| **OpenAITTS** | | | | **yes** | |
| **ElevenLabsTTS** | | | | **yes** | |
| **CartesiaTTS** | | | | **yes** | |
| **BrowserAudioOutput** | | | | | **yes** |
| **NullInput** | **yes** | **yes** | | | |
| **NullOutput** | | | | **yes** | **yes** |

> The pipeline requires all 5 roles to be filled. If both `input` and `stt` are uncovered, `NullInput` is auto-filled (text-only, no microphone). If both `tts` and `output` are uncovered, `NullOutput` is auto-filled (text-only, no speakers). If an STT is provided without an `input`, `MicrophoneInput` is auto-filled. If a TTS is provided without an `output`, `BrowserAudioOutput` is auto-filled. If no `llm` is provided, `AnthropicLLM` (`claude-haiku-4-5`) is auto-filled.

---

### Audio Input / Output (Pipeline I/O)

These providers handle the `input` and `output` roles in the 5-role pipeline. They are not tied to any vendor.

| | MicrophoneInput | BufferInput | NullInput | BrowserAudioOutput | NullOutput |
|---|---|---|---|---|---|
| **Role** | `input` | `input` | `input` + `stt` | `output` | `tts` + `output` |
| **Environment** | Browser | Node/Bun/Deno | Any | Browser | Any |
| **Peer dependency** | None | None | None | None | None |
| **Description** | Wraps `getUserMedia` + `AudioContext` for browser microphone capture | Accepts pushed `ArrayBuffer` data for server-side pipelines | Text-only input — no microphone, covers both `input` and `stt` roles | Wraps `AudioContext` for browser speaker playback | Text-only output — no speakers, covers both `tts` and `output` roles |

**MicrophoneInput** buffers audio frames in the input queue while the STT WebSocket connects, then flushes them in order — no audio is ever lost. **BufferInput** does the same for programmatic audio sources. **NullInput** covers both `input` and `stt` roles for text-only pipelines — no microphone is requested.

**BrowserAudioOutput** handles `AudioContext` resumption and buffers frames in the output queue during speaker setup. **NullOutput** covers both `tts` and `output` roles for text-only pipelines — no audio is played.

> Multi-role providers like `NativeSTT` (input+stt), `NativeTTS` (tts+output), `NullInput` (input+stt), and `NullOutput` (tts+output) cover multiple pipeline roles. When using them, you do not need separate input/output providers.

---

### Deepgram

| | STT (V1) | STT (V2) | TTS |
|---|---|---|---|
| **Class** | [`DeepgramSTT`](/guides/stt/deepgram-stt) | [`DeepgramFlux`](/guides/stt/deepgram-flux) | [`DeepgramTTS`](/guides/tts/deepgram-tts) |
| **Transport** | WebSocket | WebSocket | WebSocket |
| **Streaming** | Yes | Yes | Yes |
| **Peer dependency** | None | None | None |
| **Proxy support** | Yes | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers | All modern browsers |
| **Default model** | nova-3 | flux-general-en | aura-2-thalia-en |

**DeepgramSTT (V1/Nova) features:** Interim results, smart formatting, auto-punctuation, speaker diarization, entity detection, keyword boosting, profanity filter, redaction (PCI/SSN), numerals conversion, VAD events, word-level timestamps, configurable endpointing, utterance buffering, multichannel transcription. Models: nova-3 (recommended), nova-3-medical, nova-2 (+ domain variants), nova (legacy).

**DeepgramFlux (V2/Flux) features:** Turn-based conversation model, eager end-of-turn detection (configurable thresholds: `eot_threshold` 0.5–0.9, `eager_eot_threshold` 0.3–0.9), end-of-turn timeout (`eot_timeout_ms`), keyterm support, word confidence scores. Events: `StartOfTurn`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`, `Update`. Models: flux-general-en. **Only provider that supports the eager LLM pipeline.**

**TTS features:** Real-time streaming synthesis, linear16/mulaw/alaw encoding, configurable sample rate (8–48 kHz), word-level timing metadata.

**TTS models:** Aura 2 (recommended — 40 English voices + 10 Spanish voices), Aura 1 (legacy — 12 English voices).

**Guides:** [DeepgramSTT](/guides/stt/deepgram-stt) · [DeepgramFlux](/guides/stt/deepgram-flux) · [DeepgramTTS](/guides/tts/deepgram-tts) · **Examples:** [20](https://github.com/lukeocodes/composite-voice/tree/main/examples/20-deepgram-pipeline), [21](https://github.com/lukeocodes/composite-voice/tree/main/examples/21-eager-pipeline), [22](https://github.com/lukeocodes/composite-voice/tree/main/examples/22-deepgram-options), [23](https://github.com/lukeocodes/composite-voice/tree/main/examples/23-deepgram-voices), [24](https://github.com/lukeocodes/composite-voice/tree/main/examples/24-deepgram-conversation-history)

---

### Anthropic

| | LLM |
|---|---|
| **Class** | [`AnthropicLLM`](/guides/llm/anthropic) |
| **Transport** | HTTP streaming (SSE) |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | claude-haiku-4-5 |

**LLM features:** Streaming via SSE, system prompts extracted to top-level `system` parameter (Anthropic API convention), `maxTokens` required (default 1024), AbortSignal cancellation for the eager pipeline, temperature and topP controls.

**Models:** claude-haiku-4-5 (fastest), claude-sonnet-4-6 (balanced), claude-opus-4-6 (most capable).

**Guides:** [AnthropicLLM](/guides/llm/anthropic) · **Examples:** [00](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent), [30](https://github.com/lukeocodes/composite-voice/tree/main/examples/30-anthropic-models), [31](https://github.com/lukeocodes/composite-voice/tree/main/examples/31-anthropic-streaming-config)

---

### OpenAI

| | LLM | TTS |
|---|---|---|
| **Class** | [`OpenAILLM`](/guides/llm/openai) | [`OpenAITTS`](/guides/tts/openai-tts) |
| **Transport** | HTTP streaming | HTTP (REST) |
| **Streaming** | Yes | No (batch synthesis) |
| **Peer dependency** | None | None |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | *(required)* | tts-1 |

**LLM features:** GPT model family, streaming token generation, `organizationId` for multi-org accounts, temperature/topP/maxTokens controls.

**LLM models:** gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo.

**TTS features:** 6 voices (alloy, echo, fable, onyx, nova, shimmer), quality/speed tradeoff via model selection (tts-1 fast, tts-1-hd quality), 5 output formats (mp3, opus, aac, flac, wav), speed control (0.25–4.0x), 4096 character limit per request, `endpoint` for Azure OpenAI compatibility.

**Guides:** [OpenAILLM](/guides/llm/openai) · [OpenAITTS](/guides/tts/openai-tts) · **Examples:** [40](https://github.com/lukeocodes/composite-voice/tree/main/examples/40-openai-pipeline), [41](https://github.com/lukeocodes/composite-voice/tree/main/examples/41-openai-deepgram), [42](https://github.com/lukeocodes/composite-voice/tree/main/examples/42-openai-tts-pipeline)

---

### Groq

| | LLM |
|---|---|
| **Class** | [`GroqLLM`](/guides/llm/groq) |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | None |
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
| **Class** | [`GeminiLLM`](/guides/llm/gemini) |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | None |
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
| **Class** | [`MistralLLM`](/guides/llm/mistral) |
| **Transport** | HTTP streaming |
| **Streaming** | Yes |
| **Peer dependency** | None |
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
| **Class** | [`AssemblyAISTT`](/guides/stt/assemblyai-stt) |
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

| | STT | TTS |
|---|---|---|
| **Class** | [`ElevenLabsSTT`](/guides/stt/elevenlabs-stt) | [`ElevenLabsTTS`](/guides/tts/elevenlabs-tts) |
| **Transport** | WebSocket | WebSocket |
| **Streaming** | Yes | Yes |
| **Peer dependency** | None | None |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | scribe_v2_realtime | eleven_turbo_v2_5 |

**STT features:** Scribe V2 Realtime (~150ms latency), 90+ languages with auto-detection, VAD and manual commit strategies, interim results (partial transcripts), word-level timestamps and confidence, base64-encoded audio, three auth methods (API key, proxy, single-use token), BCP 47 / ISO 639-1 / ISO 639-3 language code auto-mapping, configurable VAD sensitivity, `previousText` context, zero-retention mode.

**TTS features:** Voice cloning controls (stability 0–1, similarityBoost 0–1), BOS/EOS stream-input protocol, word-level alignment, 6 output formats (pcm_16000, pcm_22050, pcm_24000, pcm_44100, mp3_44100_128, ulaw_8000), multilingual models.

**TTS models:** eleven_turbo_v2_5 (fast), eleven_turbo_v2, eleven_multilingual_v2, eleven_monolingual_v1.

**Guides:** [ElevenLabsSTT](/guides/stt/elevenlabs-stt) · [ElevenLabsTTS](/guides/tts/elevenlabs-tts) · **Examples:** [80](https://github.com/lukeocodes/composite-voice/tree/main/examples/80-elevenlabs-pipeline), [81](https://github.com/lukeocodes/composite-voice/tree/main/examples/81-elevenlabs-stt)

---

### Cartesia

| | TTS |
|---|---|
| **Class** | [`CartesiaTTS`](/guides/tts/cartesia-tts) |
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
| **Class** | [`NativeSTT`](/guides/stt/native-stt) | [`NativeTTS`](/guides/tts/native-tts) |
| **Transport** | Web Speech API | SpeechSynthesis API |
| **Streaming** | Yes (interim results) | No (managed playback) |
| **Peer dependency** | None | None |
| **Proxy support** | No (no API key needed) | No (no API key needed) |
| **Browser support** | Chrome, Edge (full); Safari (limited) | All modern browsers |
| **Default model** | Browser default | OS default voice |

**STT features:** Zero dependencies, works offline, 50+ languages via browser, continuous mode, interim results, `maxAlternatives`, `startTimeout`, managed audio (browser controls the microphone directly).

**TTS features:** Zero dependencies, works offline, voice enumeration via `getAvailableVoices()`, voice selection by name/language, rate/pitch/volume controls, pause/resume/cancel playback, runtime voice switching with `setVoice()`, managed audio (browser plays directly).

**Limitations:** [NativeSTT](/guides/stt/native-stt) requires Chromium (no Firefox). Both use managed audio — the SDK cannot access raw audio streams. No preflight signals. Best for prototyping.

**Guides:** [NativeSTT](/guides/stt/native-stt) · [NativeTTS](/guides/tts/native-tts) · **Examples:** [00](https://github.com/lukeocodes/composite-voice/tree/main/examples/00-minimal-voice-agent)

---

### WebLLM (MLC AI)

| | LLM |
|---|---|
| **Class** | [`WebLLMLLM`](/guides/llm/webllm) |
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
| **WebSocket streaming** | [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [DeepgramTTS](/guides/tts/deepgram-tts), [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts) |
| **Preflight / eager LLM** | [DeepgramFlux](/guides/stt/deepgram-flux) |
| **Server proxy** | All except [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **No API key needed** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **No peer dependency** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [DeepgramTTS](/guides/tts/deepgram-tts), [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts), [AnthropicLLM](/guides/llm/anthropic), [OpenAILLM](/guides/llm/openai), [OpenAITTS](/guides/tts/openai-tts), [GroqLLM](/guides/llm/groq), [GeminiLLM](/guides/llm/gemini), [MistralLLM](/guides/llm/mistral) |
| **Managed audio** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts) |
| **Voice cloning controls** | [ElevenLabsTTS](/guides/tts/elevenlabs-tts) |
| **Emotion controls** | [CartesiaTTS](/guides/tts/cartesia-tts) |
| **Word boosting** | [DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt) |
| **Keyterm boosting** | [DeepgramFlux](/guides/stt/deepgram-flux) |
| **Offline capable** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **Speaker diarization** | [DeepgramSTT](/guides/stt/deepgram-stt) |
| **Word-level timestamps** | [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [DeepgramTTS](/guides/tts/deepgram-tts), [CartesiaTTS](/guides/tts/cartesia-tts) |
| **Language auto-detection** | [ElevenLabsSTT](/guides/stt/elevenlabs-stt) |
| **VAD commit strategy** | [ElevenLabsSTT](/guides/stt/elevenlabs-stt) |
