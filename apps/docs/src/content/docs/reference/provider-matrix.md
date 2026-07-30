---
title: Provider Matrix
description: Every provider's products, features, and capabilities at a glance — organized by company.
order: 0
---

CompositeVoice supports 25 provider companies across 36 provider classes (including 1 agent provider), plus 14 input/output providers for the 5-role pipeline. This page organizes them by company so you can see everything a single vendor offers.

### Pipeline Role Matrix

Every provider and the pipeline role(s) it fills. Multi-role providers cover two or more adjacent stages — use them for simpler configs (3 providers instead of 5). Agent providers cover `stt` + `llm` + `tts` in a single connection (1 provider instead of 5).

| Provider | `input` | `stt` | `llm` | `tts` | `output` |
|---|:---:|:---:|:---:|:---:|:---:|
| **MicrophoneInput** | **yes** | | | | |
| **BufferInput** | **yes** | | | | |
| **WebRTCInput** | **yes** | | | | |
| **NativeSTT** | **yes** | **yes** | | | |
| **DeepgramSTT** | | **yes** | | | |
| **DeepgramFlux** | | **yes** | | | |
| **AssemblyAISTT** | | **yes** | | | |
| **ElevenLabsSTT** | | **yes** | | | |
| **SonioxSTT** | | **yes** | | | |
| **GladiaSTT** | | **yes** | | | |
| **SpeechmaticsSTT** | | **yes** | | | |
| **RevAISTT** | | **yes** | | | |
| **OpenAIRealtimeSTT** | | **yes** | | | |
| **GoogleSTT** | | **yes** | | | |
| **AzureSTT** | | **yes** | | | |
| **TranscribeSTT** | | **yes** | | | |
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
| **SpeechifyTTS** | | | | **yes** | |
| **MurfTTS** | | | | **yes** | |
| **LMNTTTS** | | | | **yes** | |
| **SmallestTTS** | | | | **yes** | |
| **RimeTTS** | | | | **yes** | |
| **MiniMaxTTS** | | | | **yes** | |
| **FishAudioTTS** | | | | **yes** | |
| **GoogleTTS** | | | | **yes** | |
| **AzureTTS** | | | | **yes** | |
| **PollyTTS** | | | | **yes** | |
| **DeepgramAgent** | | **yes** | **yes** | **yes** | |
| **DiscordVoice** | **yes** | | | | **yes** |
| **BrowserAudioOutput** | | | | | **yes** |
| **WebRTCOutput** | | | | | **yes** |
| **NullInput** | **yes** | **yes** | | | |
| **NullOutput** | | | | **yes** | **yes** |

> The pipeline requires all 5 roles to be filled. If both `input` and `stt` are uncovered, `NullInput` is auto-filled (text-only, no microphone). If both `tts` and `output` are uncovered, `NullOutput` is auto-filled (text-only, no speakers). If an STT is provided without an `input`, `MicrophoneInput` is auto-filled. If a TTS is provided without an `output`, `BrowserAudioOutput` is auto-filled. If no `llm` is provided, `AnthropicLLM` (`claude-haiku-4-5`) is auto-filled. Agent providers like `DeepgramAgent` cover `stt` + `llm` + `tts` — the SDK auto-fills `MicrophoneInput` and `BrowserAudioOutput` for the remaining `input` and `output` roles.

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

### Deepgram Agent

| | Agent |
|---|---|
| **Class** | `DeepgramAgent` |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Roles** | `stt` + `llm` + `tts` |

**DeepgramAgent** connects to the Deepgram Voice Agent API (`wss://agent.deepgram.com/v1/agent/converse`) via a single WebSocket that collapses the entire STT + LLM + TTS pipeline into one connection. Deepgram handles speech recognition, LLM inference, and text-to-speech synthesis server-side — the client only sends raw audio and receives raw audio back.

**Agent features:** Configurable listen (STT), think (LLM), and speak (TTS) sub-providers via the Settings message, greeting message on session start, mid-session prompt/voice/model updates (`updatePrompt`, `updateSpeak`, `updateThink`), message injection (`injectUserMessage`, `injectAgentMessage`), client-side and server-side function calling, conversation context pre-seeding, latency metrics (`AgentStartedSpeaking` with `total_latency`, `tts_latency`, `ttt_latency`), keep-alive, barge-in support.

**Think (LLM) providers:** OpenAI, Anthropic, Google, Groq, AWS Bedrock.

**Speak (TTS) providers:** Deepgram, ElevenLabs, Cartesia, OpenAI, AWS Polly.

**Examples:** [70](https://github.com/lukeocodes/composite-voice/tree/main/examples/70-deepgram-agent)

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

| | STT | LLM | TTS |
|---|---|---|---|
| **Class** | [`OpenAIRealtimeSTT`](/guides/stt/openai-realtime-stt) | [`OpenAILLM`](/guides/llm/openai) | [`OpenAITTS`](/guides/tts/openai-tts) |
| **Transport** | WebSocket | HTTP streaming | HTTP (REST) |
| **Streaming** | Yes | Yes | No (batch synthesis) |
| **Peer dependency** | None | None | None |
| **Proxy support** | Yes | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers | All modern browsers |
| **Default model** | gpt-4o-mini-transcribe | *(required)* | tts-1 |

**STT features:** Realtime API transcription intent (`wss://api.openai.com/v1/realtime?intent=transcription`), interim results via transcript deltas, server VAD or semantic VAD turn detection for automatic turn-taking, input noise reduction (near-field/far-field), prompt-based vocabulary steering, language hint, ephemeral client-secret auth via async `apiKey` factories (WebSocket subprotocols), manual `finalize()` commits, automatic reconnection with session re-configuration.

**STT models:** gpt-4o-mini-transcribe (default), gpt-4o-transcribe, whisper-1, gpt-realtime-whisper (native streaming, manual commits only).

**LLM features:** GPT model family, streaming token generation, `organizationId` for multi-org accounts, temperature/topP/maxTokens controls.

**LLM models:** gpt-4o-mini, gpt-4o, gpt-4-turbo, gpt-3.5-turbo.

**TTS features:** 6 voices (alloy, echo, fable, onyx, nova, shimmer), quality/speed tradeoff via model selection (tts-1 fast, tts-1-hd quality), 5 output formats (mp3, opus, aac, flac, wav), speed control (0.25–4.0x), 4096 character limit per request, `endpoint` for Azure OpenAI compatibility.

**Guides:** [OpenAIRealtimeSTT](/guides/stt/openai-realtime-stt) · [OpenAILLM](/guides/llm/openai) · [OpenAITTS](/guides/tts/openai-tts) · **Examples:** [40](https://github.com/lukeocodes/composite-voice/tree/main/examples/40-openai-pipeline), [41](https://github.com/lukeocodes/composite-voice/tree/main/examples/41-openai-deepgram), [42](https://github.com/lukeocodes/composite-voice/tree/main/examples/42-openai-tts-pipeline)

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

### Soniox

| | STT |
|---|---|
| **Class** | [`SonioxSTT`](/guides/stt/soniox-stt) |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | stt-rt-v5 |

**STT features:** Interim results via provisional/confirmed token streaming, 60+ languages with automatic detection and hints, endpoint detection with a `<end>` token for turn-taking, speaker diarization, per-token language identification, domain context for specialized vocabulary, manual `finalize()`, binary audio frames (no base64 overhead), temporary API key support via async `apiKey` factories, automatic reconnection with exponential backoff.

**Guides:** [SonioxSTT](/guides/stt/soniox-stt)

---

### Gladia

| | STT |
|---|---|
| **Class** | [`GladiaSTT`](/guides/stt/gladia-stt) |
| **Transport** | HTTP init + WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | solaria-1 |

**STT features:** Interim results (partial transcripts), configurable server-side endpointing for turn-taking, language pinning and auto-detection with per-utterance code switching, word-level timestamps and confidence, binary audio frames (no base64 overhead), session-token WebSocket URLs (only the init POST needs credentials), processing region selection (us-west / eu-west), automatic reconnection resuming the same session, graceful `stop_recording` on disconnect.

**Guides:** [GladiaSTT](/guides/stt/gladia-stt)

---

### Speechmatics

| | STT |
|---|---|
| **Class** | [`SpeechmaticsSTT`](/guides/stt/speechmatics-stt) |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | Server default (per language pack) |

**STT features:** Interim results via partial transcripts, 50+ languages with output locale and domain packs, end-of-utterance detection for turn-taking, configurable accuracy/latency (`operatingPoint`, `maxDelay`), speaker diarization, custom vocabulary (`additionalVocab`), manual `forceEndOfUtterance()`, binary audio frames (no base64 overhead), temporary key (JWT) support via async `apiKey` factories, automatic reconnection with exponential backoff.

**Guides:** [SpeechmaticsSTT](/guides/stt/speechmatics-stt)

---

### Rev AI

| | STT |
|---|---|
| **Class** | [`RevAISTT`](/guides/stt/revai-stt) |
| **Transport** | WebSocket |
| **Streaming** | Yes |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | *(default streaming model)* |

**STT features:** Interim results via partial hypotheses, punctuated and capitalized finals with per-word timestamps and confidence, 9 languages (en, fr, de, it, ja, ko, cmn, pt, es), profanity filtering, disfluency removal, custom vocabularies, speaker-switch labels (`machine_v2` transcriber), configurable segment duration for faster finals, raw/FLAC/WAV audio via `content_type`, graceful `EOS` end-of-stream, automatic reconnection with exponential backoff, async `apiKey` factories for short-lived tokens.

**Guides:** [RevAISTT](/guides/stt/revai-stt)

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

### Speechify

| | TTS |
|---|---|
| **Class** | [`SpeechifyTTS`](/guides/tts/speechify-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | simba-english |

**TTS features:** Catalog and instant-cloned voices via `voiceId`, English and multilingual Simba models, 4 output formats (mp3, wav, ogg, aac), optional loudness and text normalization, emotion/pitch/speed via SSML `<prosody>` tags in the input.

**Models:** simba-3.2 (latest), simba-3.0, simba-multilingual, simba-english (default).

**Guides:** [SpeechifyTTS](/guides/tts/speechify-tts)

---

### Murf AI

| | TTS |
|---|---|
| **Class** | [`MurfTTS`](/guides/tts/murf-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | GEN2 |

**TTS features:** Gen2 model with natural, studio-quality voices, per-voice speaking styles (`style`), rate and pitch controls (-50 to 50), prosody variation (0–5), multilingual voices via `locale`, 5 output formats (mp3, wav, flac, alaw, ulaw), configurable sample rate (8–48 kHz) and channel type, base64 inline audio (no second download request).

**Models:** GEN2 (default).

**Guides:** [MurfTTS](/guides/tts/murf-tts)

---

### LMNT

| | TTS |
|---|---|
| **Class** | [`LMNTTTS`](/guides/tts/lmnt-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | blizzard |

**TTS features:** Catalog and instant-cloned voices via `voice`, 31 languages with auto-detection, 7 output formats (mp3, wav, aac, ulaw, webm, pcm_s16le, pcm_f32le), configurable sample rate (8/16/24 kHz), expressiveness (`temperature`) and stability (`topP`) controls.

**Models:** blizzard (Blizzard 2.0, default).

**Guides:** [LMNTTTS](/guides/tts/lmnt-tts)

---

### Smallest.ai

| | TTS |
|---|---|
| **Class** | [`SmallestTTS`](/guides/tts/smallest-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | lightning_v3.1 |

**TTS features:** Ultra-low-latency Waves Lightning models, catalog and cloned voices via `voiceId`, 12 languages (English, Hindi, Spanish, and 9 Indian languages), 5 output formats (wav, mp3, pcm, ulaw, alaw), configurable sample rate (8–44.1 kHz) and speed (0.5–2.0x).

**Models:** lightning_v3.1 (default), lightning_v3.1_pro (curated voice pool, improved naturalness).

**Guides:** [SmallestTTS](/guides/tts/smallest-tts)

---

### Rime

| | TTS |
|---|---|
| **Class** | [`RimeTTS`](/guides/tts/rime-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | arcana |

**TTS features:** Per-model voice catalogs via `speaker`, flagship `coda` and expressive `arcana` model families plus the low-latency `mist` family, 6 output formats selected via the `Accept` header (mp3, wav, ogg, webm, pcm, mulaw), configurable sampling rate, speed (`speedAlpha`) and normalization (`noTextNormalization`) controls on `mistv2`, multilingual synthesis on Coda and Arcana.

**Models:** coda (flagship), arcana (default), arcanav3, arcanav2, mistv3 (fastest), mistv2.

**Guides:** [RimeTTS](/guides/tts/rime-tts)

---

### MiniMax

| | TTS |
|---|---|
| **Class** | [`MiniMaxTTS`](/guides/tts/minimax-tts) |
| **Transport** | REST |
| **Streaming** | No |
| **Peer dependency** | None |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | speech-02-hd |

**TTS features:** 300+ system voices across 30+ languages plus cloned voices via `voiceId`, emotion/speed/volume/pitch controls, 4 output formats (mp3, wav, flac, pcm), `languageBoost` pronunciation hints, custom pronunciation dictionary, optional `groupId` for older group-scoped keys.

**Models:** speech-2.8-hd / speech-2.8-turbo (latest), speech-2.6-hd / speech-2.6-turbo, speech-02-hd (default) / speech-02-turbo, speech-01-hd / speech-01-turbo.

**Guides:** [MiniMaxTTS](/guides/tts/minimax-tts)

---

### Fish Audio

| | TTS |
|---|---|
| **Class** | [`FishAudioTTS`](/guides/tts/fishaudio-tts) |
| **Transport** | REST (msgpack request bodies) |
| **Streaming** | No |
| **Peer dependency** | `@msgpack/msgpack` >=3.0.0 (optional) |
| **Proxy support** | Yes |
| **Browser support** | All modern browsers |
| **Default model** | s2.1-pro-free |

**TTS features:** Catalog voices via `referenceId`, instant voice cloning via inline binary reference audio, model generation selected with the `model` HTTP header, 4 output formats (mp3, wav, pcm, opus), prosody controls (speed 0.5–2.0, volume), latency modes (`normal` / `balanced` ~300ms time-to-first-audio), text normalization, configurable mp3 bitrate and chunk length.

**Models:** s2.1-pro (recommended for production), s2.1-pro-free (free tier, default), s2-pro, s1.

**Peer dependency:** Requests are MessagePack-encoded (`Content-Type: application/msgpack`), so `FishAudioTTS` requires the optional peer dependency [`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack) — install it with `pnpm add @msgpack/msgpack`. It is loaded lazily during `initialize()`.

**Guides:** [FishAudioTTS](/guides/tts/fishaudio-tts)

---

### Google Cloud

| | STT | TTS |
|---|---|---|
| **Class** | [`GoogleSTT`](/guides/stt/google-stt) | [`GoogleTTS`](/guides/tts/google-tts) |
| **Transport** | HTTP (REST, batch) | HTTP (REST) |
| **Streaming** | No (batch, per-utterance) | No (batch synthesis) |
| **Peer dependency** | None | None |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | *(Google default for the language)* | *(Google default voice for the language)* |

**GoogleSTT (batch) features:** Synchronous `speech:recognize` REST transcription of complete recordings (up to 60 seconds / 10 MB per request), one final `utteranceComplete` result per utterance, automatic punctuation, profanity filtering, phrase hints (`keywords` → `speechContexts`), up to 3 alternative language candidates, word-level time offsets in metadata, WAV/FLAC header auto-detection. Models: latest_short (best for voice-agent turns), latest_long, telephony, telephony_short, medical_dictation, medical_conversation, and legacy models. **No streaming variant:** Google's `StreamingRecognize` is gRPC-only (v1 and v2) with no public WebSocket endpoint, so a zero-dependency live provider is not possible.

**TTS features:** Full Google voice catalog — Chirp 3: HD (latest generation), Neural2, Studio, WaveNet, Polyglot, News, Casual, Standard (Journey voices were retired into Chirp 3: HD) — SSML input (auto-detected via a leading `<speak` tag), speaking rate / pitch / volume gain controls, configurable sample rate, device effects profiles, 5 encodings (MP3, OGG_OPUS, LINEAR16, MULAW, ALAW).

**Auth:** Google Cloud API key injected as the `X-goog-api-key` header (direct mode) or server-side by the proxy (`googleCloudApiKey` config registers both the `google-tts` and `google-stt` routes). OAuth2 service accounts are out of scope. This is separate from the Gemini LLM key/route above.

**Guides:** [GoogleSTT](/guides/stt/google-stt) · [GoogleTTS](/guides/tts/google-tts)

---

### Microsoft Azure

| | STT | TTS |
|---|---|---|
| **Class** | [`AzureSTT`](/guides/stt/azure-stt) | [`AzureTTS`](/guides/tts/azure-tts) |
| **Transport** | WebSocket | REST |
| **Streaming** | Yes | No |
| **Peer dependency** | None | None |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers | All modern browsers |
| **Default model** | Azure Speech service | *(voice required, e.g. en-US-AriaNeural)* |

**STT features:** Real-time recognition over the Speech service WebSocket protocol (the same wire format as the official Speech SDK), 100+ locales, interim hypotheses, service-side end-of-utterance detection driving `utteranceComplete`, continuous recognition across turns, `simple`/`detailed` (NBest + confidence) output, profanity handling, browser-safe query-parameter auth (subscription key or 10-minute bearer token), automatic reconnection with exponential backoff.

**TTS features:** Hundreds of neural voices across 140+ locales, SSML synthesis with automatic XML escaping, speaking styles via `<mstts:express-as>` (with `styleDegree`), rate/pitch via `<prosody>`, output formats spanning mp3, wav (riff), ogg/webm opus, and raw pcm via `X-Microsoft-OutputFormat`.

**Auth:** Both providers accept a Speech resource key (`Ocp-Apim-Subscription-Key`) or an async `apiKey` factory returning a 10-minute STS bearer token; both share the `azureSpeechApiKey` + `azureSpeechRegion` proxy configuration.

**Guides:** [AzureSTT](/guides/stt/azure-stt) · [AzureTTS](/guides/tts/azure-tts)

---

### Amazon Web Services

| | STT | TTS |
|---|---|---|
| **Class** | [`TranscribeSTT`](/guides/stt/transcribe-stt) | [`PollyTTS`](/guides/tts/polly-tts) |
| **Transport** | WebSocket (SigV4-presigned) | REST (SigV4-signed) |
| **Streaming** | Yes | No |
| **Peer dependency** | None | None |
| **Proxy support** | Yes | Yes |
| **Browser support** | All modern browsers (WebCrypto) | All modern browsers (WebCrypto) |
| **Default model** | Amazon Transcribe streaming | *(voice/engine required)* |

**Auth:** AWS requests are authenticated with Signature Version 4 rather than an API key — the SDK signs Polly requests (`Authorization` header) and presigns Transcribe WebSocket URLs (`X-Amz-*` query parameters) using a built-in WebCrypto signer; no AWS SDK dependency. In browsers, use temporary STS/Cognito credentials via an async `credentials` factory, or route through the proxy (`aws` proxy config) so credentials stay server-side.

**TranscribeSTT features:** Interim (`IsPartial`) and final results with word-level timing and confidence, partial-results stabilization (`high`/`medium`/`low`), custom vocabularies and vocabulary filters (remove/mask/tag), speaker partitioning, automatic language identification with candidate `languageOptions`, session IDs, binary `application/vnd.amazon.eventstream` audio framing with CRC32 validation.

**PollyTTS features:** Neural, generative, long-form, and standard engines, 100+ voices across 40+ language variants, SSML input (`textType: 'ssml'`), pronunciation lexicons, 4 output formats (mp3, ogg_vorbis, ogg_opus, pcm), configurable sample rate.

**Guides:** [TranscribeSTT](/guides/stt/transcribe-stt) · [PollyTTS](/guides/tts/polly-tts)

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
| **WebSocket streaming** | [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [DeepgramTTS](/guides/tts/deepgram-tts), DeepgramAgent, [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts), [SonioxSTT](/guides/stt/soniox-stt), [GladiaSTT](/guides/stt/gladia-stt), [SpeechmaticsSTT](/guides/stt/speechmatics-stt), [RevAISTT](/guides/stt/revai-stt), [OpenAIRealtimeSTT](/guides/stt/openai-realtime-stt), [AzureSTT](/guides/stt/azure-stt), [TranscribeSTT](/guides/stt/transcribe-stt) |
| **Preflight / eager LLM** | [DeepgramFlux](/guides/stt/deepgram-flux) |
| **Agent provider (stt+llm+tts)** | DeepgramAgent |
| **Server proxy** | All except [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **No API key needed** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **No peer dependency** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [DeepgramTTS](/guides/tts/deepgram-tts), [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [CartesiaTTS](/guides/tts/cartesia-tts), [AnthropicLLM](/guides/llm/anthropic), [OpenAILLM](/guides/llm/openai), [OpenAITTS](/guides/tts/openai-tts), [GroqLLM](/guides/llm/groq), [GeminiLLM](/guides/llm/gemini), [MistralLLM](/guides/llm/mistral), [SpeechifyTTS](/guides/tts/speechify-tts), [SonioxSTT](/guides/stt/soniox-stt), [GladiaSTT](/guides/stt/gladia-stt), [MurfTTS](/guides/tts/murf-tts), [LMNTTTS](/guides/tts/lmnt-tts), [SmallestTTS](/guides/tts/smallest-tts), [RimeTTS](/guides/tts/rime-tts), [MiniMaxTTS](/guides/tts/minimax-tts), [SpeechmaticsSTT](/guides/stt/speechmatics-stt), [RevAISTT](/guides/stt/revai-stt), [OpenAIRealtimeSTT](/guides/stt/openai-realtime-stt), [GoogleSTT](/guides/stt/google-stt), [GoogleTTS](/guides/tts/google-tts), [AzureSTT](/guides/stt/azure-stt), [AzureTTS](/guides/tts/azure-tts), [TranscribeSTT](/guides/stt/transcribe-stt), [PollyTTS](/guides/tts/polly-tts) |
| **Managed audio** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts) |
| **Voice cloning controls** | [ElevenLabsTTS](/guides/tts/elevenlabs-tts), [SpeechifyTTS](/guides/tts/speechify-tts), [LMNTTTS](/guides/tts/lmnt-tts), [SmallestTTS](/guides/tts/smallest-tts), [MiniMaxTTS](/guides/tts/minimax-tts), [FishAudioTTS](/guides/tts/fishaudio-tts) |
| **Emotion controls** | [CartesiaTTS](/guides/tts/cartesia-tts), [MiniMaxTTS](/guides/tts/minimax-tts), [AzureTTS](/guides/tts/azure-tts) |
| **Word boosting** | [DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt) |
| **Keyterm boosting** | [DeepgramFlux](/guides/stt/deepgram-flux) |
| **Offline capable** | [NativeSTT](/guides/stt/native-stt), [NativeTTS](/guides/tts/native-tts), [WebLLMLLM](/guides/llm/webllm) |
| **Speaker diarization** | [DeepgramSTT](/guides/stt/deepgram-stt), [SonioxSTT](/guides/stt/soniox-stt), [SpeechmaticsSTT](/guides/stt/speechmatics-stt), [TranscribeSTT](/guides/stt/transcribe-stt) |
| **Word-level timestamps** | [DeepgramSTT](/guides/stt/deepgram-stt), [DeepgramFlux](/guides/stt/deepgram-flux), [AssemblyAISTT](/guides/stt/assemblyai-stt), [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [SonioxSTT](/guides/stt/soniox-stt), [GladiaSTT](/guides/stt/gladia-stt), [DeepgramTTS](/guides/tts/deepgram-tts), [CartesiaTTS](/guides/tts/cartesia-tts), [SpeechmaticsSTT](/guides/stt/speechmatics-stt), [RevAISTT](/guides/stt/revai-stt), [GoogleSTT](/guides/stt/google-stt), [TranscribeSTT](/guides/stt/transcribe-stt) |
| **Language auto-detection** | [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [SonioxSTT](/guides/stt/soniox-stt), [GladiaSTT](/guides/stt/gladia-stt), [TranscribeSTT](/guides/stt/transcribe-stt) |
| **VAD commit strategy** | [ElevenLabsSTT](/guides/stt/elevenlabs-stt), [OpenAIRealtimeSTT](/guides/stt/openai-realtime-stt) |
| **Batch (per-utterance) STT** | [GoogleSTT](/guides/stt/google-stt) |
