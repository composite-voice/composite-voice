# CompositeVoice Benchmarking Methodology

> A circumlocutory, measurable, proveable, and repeatable methodology for benchmarking
> speech-to-text, large language model, and text-to-speech providers — both independently
> and as a composite voice pipeline — using the CompositeVoice SDK as the measurement
> instrument.

## Table of Contents

1. [Principles](#1-principles)
2. [Measurement Instrument](#2-measurement-instrument)
3. [Feature Alignment Protocol](#3-feature-alignment-protocol)
4. [Dataset Selection](#4-dataset-selection)
5. [Benchmark Protocols](#5-benchmark-protocols)
6. [Statistical Requirements](#6-statistical-requirements)
7. [Environment Recording](#7-environment-recording)
8. [Distributed Execution and Storage](#8-distributed-execution-and-storage)
9. [Result File Schema](#9-result-file-schema)
10. [Querying and Comparison](#10-querying-and-comparison)
11. [Reproducibility Contract](#11-reproducibility-contract)

---

## 1. Principles

This methodology is governed by four non-negotiable principles. Every design decision
in this document traces back to one or more of these principles, and any proposed
modification to the methodology must demonstrate that it does not violate them.

### 1.1 Circumlocutory (Verbose)

Every measurement, every configuration choice, and every procedural step is documented
in full. Nothing is left implicit. Where a simpler methodology might say "use default
settings," this methodology enumerates every setting, its value, and the rationale for
that value. This verbosity is intentional: it eliminates ambiguity, prevents
misinterpretation, and ensures that two independent teams following this document will
produce identical test configurations.

### 1.2 Measurable

Every claim made by a benchmark run must be backed by a quantitative measurement
derived from observable events. Qualitative assessments (e.g., "voice quality") are
excluded unless accompanied by a quantitative proxy (e.g., MOS score, PESQ score).
All measurements are expressed in SI units (milliseconds for latency, words per minute
for throughput, percentage for accuracy) with explicit precision bounds.

### 1.3 Proveable

Every measurement must be independently verifiable. This means:

- Raw event logs are preserved alongside computed metrics.
- Any metric can be recomputed from the raw logs by a third party.
- Ground-truth data (reference transcriptions, input prompts, expected behaviors) is
  published alongside results.
- The measurement instrument (CompositeVoice SDK event system) is open source and
  auditable.

### 1.4 Repeatable

Any benchmark run must be reproducible by an independent party using the same
methodology document, the same dataset version, and the same provider API version.
Repeatability requires:

- Pinned dataset versions (commit hashes or release tags).
- Recorded provider API versions and model identifiers.
- Fixed random seeds where applicable (LLM temperature = 0).
- Documented environment specifications (hardware, network, geography).
- Minimum sample sizes with statistical power analysis.
- Warm-up protocols to eliminate cold-start variance.

---

## 2. Measurement Instrument

### 2.1 The SDK as Measurement Harness

CompositeVoice's event system serves as the sole measurement instrument. All providers
— regardless of transport protocol (WebSocket, REST), hosting model (cloud, edge,
browser-local), or implementation details — pass through the same SDK event pipeline
and state machine transitions.

This architecture guarantees that any overhead introduced by the measurement instrument
is **constant across all providers**. The SDK adds identical processing to every
provider's event path: the same `EventEmitter.emitSync()` call, the same `Date.now()`
timestamp capture, the same state machine derivation. Therefore, while absolute latency
numbers include SDK overhead, **relative comparisons between providers are valid**
because the bias is uniform and cancels out in differential analysis.

### 2.2 Clock Source

All timestamps are captured via `Date.now()` at the point of event emission within
`CompositeVoice.ts`. This provides:

- **Resolution**: Sub-millisecond on modern V8/SpiderMonkey engines.
- **Monotonicity**: Not guaranteed (system clock adjustments can cause backwards jumps).
  Benchmark runs should be conducted on systems with NTP synchronization disabled or
  with `performance.now()` used as a monotonic fallback for intra-run measurements.
- **Precision**: Integer milliseconds (sufficient for network-bound provider latencies
  which are typically 50ms-5000ms).

### 2.3 Event Observation Points

The following events constitute the complete set of measurement points. Each event
carries a `timestamp: number` field (Unix milliseconds) and optional `metadata`.

#### STT Events

| Event | Fields | Measurement Use |
|-------|--------|-----------------|
| `transcription.start` | `timestamp` | STT session initialization |
| `transcription.interim` | `text`, `confidence?`, `timestamp` | Partial result latency |
| `transcription.final` | `text`, `confidence?`, `timestamp` | Segment commit latency |
| `transcription.speechFinal` | `text`, `confidence?`, `timestamp` | Utterance-complete latency (canonical LLM trigger) |
| `transcription.preflight` | `text`, `confidence?`, `timestamp` | Early end-of-turn (Deepgram-specific, speculative) |
| `transcription.error` | `error`, `recoverable`, `timestamp` | Error rate tracking |

#### LLM Events

| Event | Fields | Measurement Use |
|-------|--------|-----------------|
| `llm.start` | `prompt`, `timestamp` | Generation request sent |
| `llm.chunk` | `chunk`, `accumulated`, `timestamp` | Per-token streaming latency |
| `llm.complete` | `text`, `tokensUsed?`, `timestamp` | Total generation time |
| `llm.error` | `error`, `recoverable`, `timestamp` | Error rate tracking |

#### TTS Events

| Event | Fields | Measurement Use |
|-------|--------|-----------------|
| `tts.start` | `text`, `timestamp` | Synthesis request sent |
| `tts.audio` | `chunk: AudioChunk`, `timestamp` | Per-chunk audio delivery |
| `tts.metadata` | `metadata: AudioMetadata`, `timestamp` | Audio format confirmation |
| `tts.complete` | `timestamp` | All audio chunks delivered |
| `tts.error` | `error`, `recoverable`, `timestamp` | Error rate tracking |

#### Agent Lifecycle Events

| Event | Fields | Measurement Use |
|-------|--------|-----------------|
| `agent.ready` | `timestamp` | Initialization complete |
| `agent.stateChange` | `state`, `previousState`, `timestamp` | State transition timing |
| `agent.error` | `error`, `recoverable`, `context?`, `timestamp` | Lifecycle error tracking |

#### Audio Events

| Event | Fields | Measurement Use |
|-------|--------|-----------------|
| `audio.capture.start` | `timestamp` | Microphone activation |
| `audio.capture.stop` | `timestamp` | Microphone deactivation |
| `audio.playback.start` | `timestamp` | **Defined but NOT emitted** |
| `audio.playback.end` | `timestamp` | **Defined but NOT emitted** |

> **Known Gap**: `audio.playback.start` and `audio.playback.end` are defined in the
> type system but are not currently emitted by `CompositeVoice.ts`. Playback latency
> (time from first audio chunk to speaker output) is therefore **not measurable** in
> the current SDK version. This gap is documented here for transparency. Full-stack
> benchmarks measure up to `tts.complete` (all audio chunks delivered to the player)
> rather than actual audible output.

---

## 3. Feature Alignment Protocol

When comparing providers within a layer (e.g., Deepgram STT vs. AssemblyAI STT),
configuration must be aligned to isolate provider performance from feature differences.
A provider-specific feature that adds processing (e.g., diarization, smart formatting,
profanity filtering) introduces latency that is not attributable to core provider
performance. Therefore, all provider-specific features must be disabled unless they
are part of the specific feature under test.

### 3.1 STT Feature Alignment

The following table defines the canonical STT benchmark configuration. Any deviation
from these values must be documented as a separate benchmark variant.

| Setting | Value | Rationale |
|---------|-------|-----------|
| `language` | `'en-US'` | English is the common denominator across all STT providers. Multilingual benchmarks are a separate test category. |
| `interimResults` | `true` | Required for measuring time-to-first-partial-result. Does not affect final transcription latency. |
| `encoding` | `'linear16'` | Uncompressed PCM eliminates codec variance. All providers accept linear16. |
| `sampleRate` | `16000` | 16 kHz is the standard for speech recognition. LibriSpeech is natively 16 kHz. |
| `channels` | `1` | Mono. Voice input is single-channel. |
| `punctuation` | `false` | Disable. Post-processing adds latency. Accuracy measured on raw text. |
| `profanityFilter` | `false` | Disable. Filtering adds processing overhead. |
| `diarize` | `false` | Disable. Speaker detection is not relevant for single-speaker benchmarks. |
| `smartFormat` | `false` | Disable. Formatting transforms add latency and change output text. |
| `redact` | `[]` (none) | Disable. Redaction adds processing overhead. |
| `keywords` | `[]` (none) | Disable. Custom vocabulary biasing is a feature test, not a baseline test. |
| `endpointing` | Provider default | Do not override. Endpointing behavior is part of what we are measuring. |
| `vadEvents` | `false` | Disable. VAD event overhead is provider-specific. |
| `model` | **Tier-matched** | See Section 3.1.1 |

#### 3.1.1 STT Model Tier Matching

Providers offer models at different quality/speed tiers. Benchmarks must compare
models within the same tier:

| Tier | Deepgram | AssemblyAI | Native |
|------|----------|-----------|--------|
| **Fast** | `nova-3` | `default` (real-time) | Browser default |
| **Quality** | `nova-2` | N/A | N/A |

> **Note**: NativeSTT (Web Speech API) does not offer model selection. It is included
> as a zero-cost baseline but is not directly comparable to cloud providers due to
> fundamental architectural differences (browser-managed audio, no network round-trip
> for some engines, platform-dependent implementation).

### 3.2 LLM Feature Alignment

| Setting | Value | Rationale |
|---------|-------|-----------|
| `stream` | `true` | Streaming is the production mode for voice applications. Batch mode is a separate test category. |
| `temperature` | `0` | Deterministic output. Eliminates sampling variance across runs. Required for repeatability. |
| `topP` | `1.0` | No nucleus sampling restriction. Combined with temperature=0, this produces greedy decoding. |
| `maxTokens` | `256` | Fixed upper bound. Prevents runaway generation. Large enough for conversational responses. |
| `systemPrompt` | See Section 3.2.1 | Identical across all providers. |
| `stopSequences` | `[]` (none) | No early stopping. Let the model generate to natural completion or maxTokens. |
| `frequencyPenalty` | `0` | No repetition penalty. Default behavior. |
| `presencePenalty` | `0` | No presence penalty. Default behavior. |
| `tools` | `[]` (none) | No function calling. Tool use is a separate benchmark category. |

#### 3.2.1 Standardized System Prompt

All LLM benchmarks use the following system prompt unless the benchmark variant
explicitly specifies otherwise:

```
You are a helpful voice assistant. Respond concisely and conversationally.
Keep responses under 3 sentences unless the question requires more detail.
```

This prompt is chosen because:

1. It is representative of real voice-agent usage.
2. It constrains response length (reducing variance in generation time due to output
   length differences).
3. It does not advantage any particular model's training data or instruction format.
4. It is short enough to have negligible tokenization impact across providers.

#### 3.2.2 LLM Model Tier Matching

| Tier | Anthropic | OpenAI | Groq | Mistral | Gemini | WebLLM |
|------|-----------|--------|------|---------|--------|--------|
| **Fast** | `claude-haiku-4-5` | `gpt-4o-mini` | `llama-3.3-70b-versatile` | `mistral-small-latest` | `gemini-2.0-flash` | `Llama-3.2-1B-Instruct-q4f16_1-MLC` |
| **Balanced** | `claude-sonnet-4-6` | `gpt-4o` | N/A | `mistral-medium-latest` | `gemini-1.5-pro` | N/A |
| **Quality** | `claude-opus-4-6` | `gpt-4` | N/A | `mistral-large-latest` | N/A | N/A |

> **Note on Groq**: Groq runs open-source models (Llama, Mixtral) on custom LPU
> hardware. Its speed advantage comes from inference hardware, not model architecture.
> Groq is placed in the "Fast" tier because that is its primary value proposition,
> but the model it runs (Llama 3.3 70B) is architecturally a "Balanced/Quality" model.
> This asymmetry must be noted in benchmark reports.

> **Note on WebLLM**: WebLLM runs quantized models in-browser via WebGPU. It has zero
> network latency but is constrained by client GPU performance. WebLLM benchmarks
> must record GPU model and VRAM alongside results. WebLLM is not directly comparable
> to cloud providers and is included as an offline/privacy baseline.

### 3.3 TTS Feature Alignment

| Setting | Value | Rationale |
|---------|-------|-----------|
| `encoding` | `'linear16'` | Uncompressed PCM where supported. Eliminates codec encoding time. |
| `sampleRate` | `24000` | 24 kHz provides good quality for speech. Deepgram and LibriTTS default. |
| `channels` | `1` | Mono. Voice output is single-channel. |
| `rate` | `1.0` | Normal speaking rate. No speed modification. |
| `pitch` | `0` | Default pitch. No modification. |
| `stability` | Provider default | ElevenLabs-specific. Not aligned (it's what we're measuring). |
| `similarityBoost` | Provider default | ElevenLabs-specific. Not aligned. |
| `emotion` | `[]` (none) | Cartesia-specific. Disable to avoid processing overhead. |
| `speed` | `1.0` (Cartesia) | Normal speed. |
| `model` | **Tier-matched** | See Section 3.3.1 |
| `voice` | **Default per provider** | See Section 3.3.2 |

#### 3.3.1 TTS Model Tier Matching

| Tier | Deepgram | OpenAI | ElevenLabs | Cartesia | Native |
|------|----------|--------|-----------|----------|--------|
| **Fast** | `aura-2-thalia-en` | `tts-1` | `eleven_turbo_v2_5` | `sonic-2` | Browser default |
| **Quality** | N/A | `tts-1-hd` | `eleven_multilingual_v2` | N/A | N/A |

#### 3.3.2 TTS Voice Selection

Voice selection is inherently non-alignable across providers — each provider has
unique voice identities. The benchmark reports must document which voice was used
per provider. For consistency within a provider's benchmark runs, the same voice
must be used across all trials.

| Provider | Default Voice | Notes |
|----------|--------------|-------|
| Deepgram | `aura-2-thalia-en` | Female, English |
| OpenAI | `nova` | Female, English |
| ElevenLabs | Provider default | Requires `voiceId`; use a stable public voice |
| Cartesia | Provider default | Requires `voiceId`; use a stable public voice |
| Native | System default | Browser/OS-dependent |

#### 3.3.3 TTS Transport Alignment

TTS providers use different transport protocols, which is itself a latency factor:

| Provider | Transport | Streaming? |
|----------|-----------|------------|
| Deepgram | WebSocket | Yes — chunked text in, chunked audio out |
| ElevenLabs | WebSocket | Yes — chunked text in, chunked audio out |
| Cartesia | WebSocket | Yes — chunked text in, chunked audio out |
| OpenAI | REST | No — full text in, complete audio out |
| Native | Browser API | N/A — browser-managed playback |

Transport differences are **not** normalized. They are part of what the benchmark
measures. A provider's choice of REST vs. WebSocket is an architectural decision
that affects real-world voice-agent latency, and users of this benchmark need to
understand that impact.

---

## 4. Dataset Selection

### 4.1 STT Benchmark Dataset: LibriSpeech

**Source**: [OpenSLR / LibriSpeech](http://www.openslr.org/12/)
**License**: CC BY 4.0
**Format**: FLAC, 16 kHz, mono
**Reference**: [awesome-audio-datasets](https://github.com/zruiii/awesome-audio-datasets)

#### 4.1.1 Subset Selection

| Subset | Hours | Speakers | Purpose |
|--------|-------|----------|---------|
| `test-clean` | 5.4h | 40 | Primary benchmark. Clean studio speech. Industry-standard WER comparison. |
| `test-other` | 5.1h | 33 | Secondary benchmark. More challenging acoustics. Tests provider robustness. |

#### 4.1.2 Audio Preparation

LibriSpeech audio is distributed as FLAC files. For benchmarking:

1. **Decode to PCM**: Convert FLAC → linear16 PCM at 16 kHz, mono.
2. **Segment by utterance**: Each FLAC file corresponds to one utterance with a
   known transcription. This is the atomic unit of measurement.
3. **Verify checksums**: SHA-256 hash of each decoded PCM file must be recorded
   and published with results to ensure dataset integrity.
4. **Do not resample**: LibriSpeech is natively 16 kHz. Resampling introduces
   artifacts that would confound STT accuracy measurements.

#### 4.1.3 Ground Truth

LibriSpeech provides reference transcriptions as `.trans.txt` files (one line per
utterance: `<utterance-id> <transcription>`). These are the ground truth for WER
(Word Error Rate) computation.

- Transcriptions are normalized to uppercase in the original dataset.
- WER computation must case-normalize both reference and hypothesis before comparison.
- Punctuation is stripped from both sides (LibriSpeech references have no punctuation;
  provider output may include punctuation if not disabled).

### 4.2 LLM Benchmark Dataset: Standardized Prompt Sets

LLM benchmarks do not use audio datasets. Instead, they use fixed prompt sets that
simulate the text a STT provider would produce. This isolates LLM performance from
STT variance.

#### 4.2.1 Prompt Categories

| Category | Count | Avg. Length | Purpose |
|----------|-------|-------------|---------|
| **Conversational** | 50 | 8-15 words | Short questions typical of voice interactions. "What's the weather like?" |
| **Instructional** | 50 | 15-30 words | Task-oriented prompts. "Explain how to change a tire in simple steps." |
| **Knowledge** | 50 | 10-20 words | Factual questions. "What is the capital of France?" |
| **Creative** | 25 | 10-25 words | Open-ended prompts. "Tell me a short joke about programmers." |
| **Long-form** | 25 | 30-60 words | Complex questions requiring longer responses. |

**Total: 200 prompts.**

#### 4.2.2 Prompt Design Constraints

1. Prompts must not reference real-time information (weather, news, current events)
   that could cause different model behaviors at different times.
2. Prompts must not require tool use, code execution, or image generation.
3. Prompts must be factually unambiguous (one clearly correct answer for knowledge
   questions).
4. Prompts must be culturally neutral and not contain sensitive content.
5. Prompts are delivered as the `user` message with the standardized system prompt
   (Section 3.2.1). No conversation history. Each prompt is independent.

### 4.3 TTS Benchmark Dataset: LJSpeech Text Corpus

**Source**: [LJSpeech](https://keithito.com/LJ-Speech-Dataset/)
**License**: Public Domain
**Reference**: [awesome-audio-datasets](https://github.com/zruiii/awesome-audio-datasets)

#### 4.3.1 Text Selection

LJSpeech contains 13,100 text passages from non-fiction books. For TTS benchmarking,
we select a stratified subset based on text length:

| Length Bucket | Word Count | Sample Size | Purpose |
|---------------|-----------|-------------|---------|
| **Short** | 5-15 words | 50 | Quick responses, minimal buffering |
| **Medium** | 16-40 words | 50 | Typical voice-agent responses |
| **Long** | 41-80 words | 50 | Extended responses, sustained synthesis |
| **Very Long** | 81-150 words | 25 | Stress test for streaming TTS |

**Total: 175 text samples.**

#### 4.3.2 Text Preparation

1. Strip any special characters not representable in standard ASCII.
2. Normalize whitespace (single spaces, no leading/trailing).
3. Record character count and word count for each sample.
4. Publish the exact text list with SHA-256 hash for reproducibility.

### 4.4 Full-Stack Benchmark Dataset

The full-stack benchmark uses LibriSpeech `test-clean` audio as input, routed through
the complete pipeline: STT → LLM → TTS. The LLM receives the STT output as a user
message (with the standardized system prompt) and generates a response, which is
then synthesized by the TTS provider.

This measures end-to-end latency from audio input to audio output, across all
provider combinations.

---

## 5. Benchmark Protocols

### 5.1 Common Protocol (All Benchmarks)

Every benchmark run — regardless of layer — follows this protocol:

#### 5.1.1 Warm-up Phase

Before recording any measurements:

1. Execute **3 warm-up trials** with representative data (not from the benchmark set).
2. Discard all warm-up measurements.
3. Purpose: Eliminate cold-start effects including TCP connection establishment,
   TLS handshake, WebSocket upgrade, provider-side model loading, JIT compilation
   of SDK code, and DNS resolution caching.

#### 5.1.2 Trial Execution

Each trial consists of:

1. **Input presentation**: Feed the input (audio for STT, text for LLM/TTS) to the
   provider via the SDK.
2. **Event capture**: Record all events emitted during the trial, with full payloads.
3. **Completion detection**: Wait for the terminal event (`transcription.speechFinal`
   for STT, `llm.complete` for LLM, `tts.complete` for TTS).
4. **Cooldown**: Wait **2 seconds** between trials to avoid provider rate limiting
   and allow connection state to stabilize.

#### 5.1.3 Error Handling

- If a trial produces an error event, record the error and **exclude the trial from
  latency calculations** but **include it in error rate calculations**.
- If more than **10% of trials** produce errors, flag the entire benchmark run as
  unreliable and investigate.
- Timeout: If no terminal event is received within **30 seconds** (STT/TTS) or
  **60 seconds** (LLM), the trial is recorded as a timeout error.

#### 5.1.4 Raw Event Log Format

Every event is recorded as a JSON object in a newline-delimited JSON (NDJSON) file:

```jsonc
{
  "runId": "uuid-v4",            // Unique per benchmark run
  "trialIndex": 0,               // Zero-indexed trial number
  "inputId": "1089-134686-0000", // Dataset sample identifier
  "event": {                     // Full event payload as emitted by SDK
    "type": "llm.chunk",
    "chunk": "Hello",
    "accumulated": "Hello",
    "timestamp": 1709251200000
  }
}
```

### 5.2 STT Benchmark Protocol

#### 5.2.1 Objective

Measure the latency and accuracy of speech-to-text providers when processing
pre-recorded audio with known transcriptions.

#### 5.2.2 Input Method

Pre-recorded audio is fed to the STT provider by:

1. Reading the PCM audio file into memory.
2. Sending audio chunks to the provider via the SDK's `AudioCapture` interface
   (or directly to the provider's `sendAudio()` method for WebSocket providers).
3. Chunk size: **4096 bytes** (256ms at 16kHz/16-bit/mono). This simulates
   real-time microphone capture cadence.
4. Chunk pacing: Audio chunks are sent at **real-time rate** (one 256ms chunk every
   256ms) to simulate live microphone input. Sending faster than real-time may
   trigger different provider behavior (buffering, rate limiting).

#### 5.2.3 Metrics

| Metric | Definition | Unit |
|--------|-----------|------|
| **Time to First Partial (TTFP)** | `transcription.interim.timestamp - audio_send_start_timestamp` | ms |
| **Time to Final Transcript (TTFT)** | `transcription.speechFinal.timestamp - audio_send_start_timestamp` | ms |
| **Transcription Latency** | `transcription.speechFinal.timestamp - audio_send_end_timestamp` | ms |
| **Word Error Rate (WER)** | Standard WER against ground truth | % |
| **Confidence Score** | Mean `confidence` across `transcription.speechFinal` events | 0-1 |
| **Error Rate** | Proportion of trials producing `transcription.error` | % |

> **TTFT vs. Transcription Latency**: TTFT measures wall-clock time from when audio
> starts being sent to when the final transcript arrives. Transcription Latency
> measures only the tail — how long after the last audio chunk the provider takes
> to produce the final result. The difference is the audio duration itself.

#### 5.2.4 Sample Size

- **Primary**: All utterances in LibriSpeech `test-clean` (~2,620 utterances).
- **Secondary**: All utterances in LibriSpeech `test-other` (~2,939 utterances).

### 5.3 LLM Benchmark Protocol

#### 5.3.1 Objective

Measure the latency and throughput of LLM providers when generating streaming
responses to fixed prompts.

#### 5.3.2 Input Method

1. Each prompt from the standardized prompt set (Section 4.2) is sent via the SDK's
   `generateFromMessages()` method with a single user message.
2. The system prompt is set per Section 3.2.1.
3. Streaming is enabled. The async iterable is consumed to completion.

#### 5.3.3 Metrics

| Metric | Definition | Unit |
|--------|-----------|------|
| **Time to First Token (TTFT)** | `first_llm.chunk.timestamp - llm.start.timestamp` | ms |
| **Total Generation Time (TGT)** | `llm.complete.timestamp - llm.start.timestamp` | ms |
| **Tokens Per Second (TPS)** | `total_tokens / (TGT / 1000)` | tokens/s |
| **Inter-Token Latency (ITL)** | Mean time between consecutive `llm.chunk` events | ms |
| **Output Length** | Character count of `llm.complete.text` | chars |
| **Token Count** | `llm.complete.tokensUsed` (where reported by provider) | tokens |
| **Error Rate** | Proportion of trials producing `llm.error` | % |

> **Note on Token Count**: Not all providers report `tokensUsed`. Where unavailable,
> estimate using a whitespace tokenizer (word count * 1.3) and flag as estimated.

#### 5.3.4 Sample Size

- **All 200 prompts** from the standardized prompt set.
- **3 runs** per prompt per provider (to measure intra-prompt variance).
- **Total**: 600 trials per provider.

### 5.4 TTS Benchmark Protocol

#### 5.4.1 Objective

Measure the latency and throughput of TTS providers when synthesizing speech from
fixed text inputs.

#### 5.4.2 Input Method

For **WebSocket providers** (Deepgram, ElevenLabs, Cartesia):

1. Connect to the provider.
2. Send the full text via `sendText()`.
3. Call `finalize()` to signal end of input.
4. Collect all `tts.audio` chunks until `tts.complete`.

For **REST providers** (OpenAI):

1. Call `synthesize(text)` with the full text.
2. Record the single response blob.
3. `tts.start` and `tts.complete` bracket the request.

For **Native TTS**:

1. Call `synthesize(text)`.
2. Record timing only (audio is browser-managed and not capturable).

#### 5.4.3 Metrics

| Metric | Definition | Unit |
|--------|-----------|------|
| **Time to First Audio (TTFA)** | `first_tts.audio.timestamp - tts.start.timestamp` | ms |
| **Total Synthesis Time (TST)** | `tts.complete.timestamp - tts.start.timestamp` | ms |
| **Audio Chunk Count** | Number of `tts.audio` events | count |
| **Audio Data Volume** | Sum of `chunk.data.byteLength` across all `tts.audio` events | bytes |
| **Synthesis Throughput** | `input_word_count / (TST / 1000)` | words/s |
| **Inter-Chunk Latency (ICL)** | Mean time between consecutive `tts.audio` events | ms |
| **Error Rate** | Proportion of trials producing `tts.error` | % |

> **Note on TTFA**: For REST providers (OpenAI), TTFA equals TST because audio is
> delivered as a single blob. This is expected and reflects the architectural choice.
> Reports must distinguish streaming and non-streaming TTFA.

#### 5.4.4 Sample Size

- **All 175 text samples** from the LJSpeech subset (Section 4.3).
- **3 runs** per sample per provider.
- **Total**: 525 trials per provider.

### 5.5 Full-Stack Benchmark Protocol

#### 5.5.1 Objective

Measure end-to-end latency of the complete voice pipeline: audio input → STT →
LLM → TTS → audio output, across all provider combinations.

#### 5.5.2 Pipeline Configuration

A full-stack benchmark run tests a specific **provider triple**:

```
(STT_provider, LLM_provider, TTS_provider)
```

For example: `(Deepgram Nova-3, Claude Haiku, Cartesia Sonic-2)`.

Each triple is configured per the Feature Alignment Protocol (Section 3) with
all providers at the same tier (e.g., all "Fast" tier).

#### 5.5.3 Input Method

1. Use LibriSpeech `test-clean` audio (a curated subset of 100 utterances, stratified
   by duration: 25 short (<5s), 25 medium (5-10s), 25 long (10-20s), 25 very long
   (>20s)).
2. Feed audio at real-time rate (Section 5.2.2).
3. STT produces transcript → LLM generates response → TTS synthesizes audio.
4. Full event log captured for all three layers.

#### 5.5.4 Metrics

| Metric | Definition | Unit |
|--------|-----------|------|
| **End-to-End Latency (E2E)** | `tts.complete.timestamp - audio_send_start_timestamp` | ms |
| **Perceived Response Time (PRT)** | `first_tts.audio.timestamp - transcription.speechFinal.timestamp` | ms |
| **STT Segment** | `transcription.speechFinal.timestamp - audio_send_start_timestamp` | ms |
| **Handoff Latency (STT→LLM)** | `llm.start.timestamp - transcription.speechFinal.timestamp` | ms |
| **LLM Segment** | `llm.complete.timestamp - llm.start.timestamp` | ms |
| **Handoff Latency (LLM→TTS)** | `tts.start.timestamp - llm.start.timestamp` | ms |
| **TTS Segment** | `tts.complete.timestamp - tts.start.timestamp` | ms |
| **Pipeline Overhead** | `E2E - (STT + LLM + TTS segments)` | ms |

> **Perceived Response Time (PRT)** is the most user-relevant metric. It measures
> how long after the user stops speaking until audio begins playing back. This is
> what a human perceives as "response time." Note that for streaming pipelines, PRT
> can be significantly less than E2E because TTS can begin synthesizing before the
> LLM finishes generating.

> **LLM→TTS Handoff**: Measured from `llm.start` (not `llm.complete`) because
> streaming TTS providers begin receiving text as LLM chunks arrive. The handoff
> is the time between the LLM starting and TTS starting, which includes the time
> for the first LLM chunk to arrive and be forwarded.

#### 5.5.5 Provider Combination Matrix

The full-stack benchmark tests all feasible combinations of providers at the
**Fast tier**:

| STT | LLM | TTS |
|-----|-----|-----|
| Deepgram Nova-3 | Claude Haiku | Deepgram Aura-2 |
| Deepgram Nova-3 | GPT-4o-mini | OpenAI tts-1 |
| Deepgram Nova-3 | Groq Llama-3.3 | ElevenLabs Turbo v2.5 |
| Deepgram Nova-3 | Gemini Flash | Cartesia Sonic-2 |
| AssemblyAI | Claude Haiku | Deepgram Aura-2 |
| AssemblyAI | GPT-4o-mini | ElevenLabs Turbo v2.5 |
| ... | ... | ... |

The full matrix is `STT_count * LLM_count * TTS_count` combinations. At the Fast
tier: **2 STT * 5 LLM * 4 TTS = 40 combinations** (excluding Native providers
which are included as separate baselines).

#### 5.5.6 Sample Size

- **100 utterances** per combination (stratified subset of LibriSpeech test-clean).
- **1 run** per utterance per combination (full matrix is already 4,000 trials).
- **Total**: 4,000 trials across all combinations.

---

## 6. Statistical Requirements

### 6.1 Summary Statistics

For every metric, report:

| Statistic | Definition |
|-----------|-----------|
| **Mean** | Arithmetic mean across all trials |
| **Median (P50)** | 50th percentile |
| **P90** | 90th percentile |
| **P95** | 95th percentile |
| **P99** | 99th percentile |
| **Min** | Minimum observed value |
| **Max** | Maximum observed value |
| **Std Dev** | Standard deviation |
| **CV** | Coefficient of variation (Std Dev / Mean) — measures relative consistency |

### 6.2 Outlier Treatment

1. Compute the **interquartile range (IQR)** = P75 - P25.
2. Mark any trial with a metric value outside `[P25 - 3*IQR, P75 + 3*IQR]` as an
   **outlier**.
3. Outliers are **included in all statistics** but are also reported separately.
4. Outliers are **never silently removed**. If outlier exclusion is desired for a
   specific analysis, it must be explicitly stated with the count and values of
   excluded points.

### 6.3 Statistical Significance

When comparing two providers on the same metric:

1. Use a **two-tailed Welch's t-test** (does not assume equal variance).
2. Report the **p-value** and **95% confidence interval** for the difference in means.
3. A difference is considered statistically significant at **p < 0.05**.
4. Also report **Cohen's d** effect size to distinguish statistical significance
   from practical significance.

### 6.4 Minimum Sample Size

The minimum sample sizes specified in Sections 5.2-5.5 are designed to achieve
**statistical power ≥ 0.8** (80% probability of detecting a true effect) at
**α = 0.05** for a **medium effect size (d = 0.5)**. This was determined using
a priori power analysis for two-sample t-tests.

---

## 7. Environment Recording

Every benchmark run must record the following environment metadata:

### 7.1 Hardware

| Field | Example |
|-------|---------|
| CPU | Apple M2 Pro, 12-core |
| RAM | 32 GB |
| GPU | Apple M2 Pro integrated (for WebLLM only) |
| Network | Wi-Fi 6E / Ethernet (specify) |
| Disk | NVMe SSD (for dataset loading) |

### 7.2 Software

| Field | Example |
|-------|---------|
| OS | macOS 14.3 / Ubuntu 22.04 |
| Node.js | v20.11.0 |
| Browser | Chromium 121.0.6167.85 (for E2E / WebLLM / Native) |
| CompositeVoice SDK | v1.2.3 (git commit hash) |
| pnpm | v8.15.1 |

### 7.3 Network

| Field | Example |
|-------|---------|
| ISP | Comcast / AWS us-east-1 |
| Geography | San Francisco, CA, USA |
| Ping to providers | `ping api.deepgram.com` → 15ms |
| Bandwidth | 500 Mbps down / 50 Mbps up |

> **Network variability** is the largest source of non-provider variance in cloud
> benchmarks. To mitigate: (1) run benchmarks from a cloud VM in a consistent region,
> (2) record ping to each provider's API endpoint before and after the run, (3) flag
> runs where ping variance exceeds 20%.

### 7.4 Provider Versions

| Field | Example |
|-------|---------|
| Provider API version | Deepgram v1 2024-01-15 |
| Model version | `nova-3` (provider-managed, not user-selectable) |
| SDK version | `@deepgram/sdk@3.1.0` |

---

## 8. Distributed Execution and Storage

Benchmark results are stored in the repository itself, using git as both the
persistence layer and the audit trail. This design decision is deliberate and
serves all four principles simultaneously: results are verbose (full JSON with
every field populated), measurable (quantitative metrics derived from events),
proveable (git history is immutable and every PR is reviewable), and repeatable
(the exact dataset, configuration, and environment are recorded alongside the
results they produced).

### 8.1 Execution Model

A benchmark run is a coordinated effort that tests one or more providers against
a specific dataset. The run is distributed across multiple isolated machines to
ensure that no test interferes with any other test. Each machine executes exactly
one test: a single provider, at a single layer, against the dataset. This isolation
guarantees that:

1. **No resource contention**: CPU, memory, and network bandwidth on one machine
   are dedicated entirely to the provider under test. A TTS benchmark consuming
   network bandwidth on the same machine as an STT benchmark would confound both
   measurements.

2. **No temporal interference**: Provider rate limits, connection pooling, and
   server-side session affinity are isolated per machine. A Deepgram STT test
   and a Deepgram TTS test running on the same machine might share a connection
   pool or trigger shared rate limits.

3. **Independent failure domains**: If one machine's test fails (network partition,
   provider outage, API key quota exhaustion), all other tests continue unaffected.
   The failed test can be retried independently without re-running the entire suite.

4. **Parallel execution**: All tests in a run execute concurrently. A run that
   tests 10 providers completes in the time of the slowest single provider test,
   not the sum of all provider tests.

Each machine is assigned its test via runtime parameters:

```
bench --dataset librispeech --subset test-clean --layer stt --provider deepgram --model nova-3 --tier fast
```

The dataset is provided at runtime, not hardcoded. This allows the same benchmark
tooling to be used with any dataset — LibriSpeech, Common Voice, LJSpeech, or a
custom dataset — without modification. The dataset path or identifier is passed
as a CLI argument, and the benchmark runner resolves it to local files.

### 8.2 Branch and Pull Request Convention

Every benchmark run produces a git branch. The branch name encodes the dataset
identity and the date of the run, providing a human-readable identifier that
maps directly to the data it contains.

#### 8.2.1 Branch Naming

```
bench/{dataset}-{subset}/{YYYY-MM-DD}
```

Examples:

| Run | Branch |
|-----|--------|
| LibriSpeech test-clean on Feb 26, 2026 | `bench/librispeech-test-clean/2026-02-26` |
| LJSpeech medium bucket on Mar 15, 2026 | `bench/ljspeech-medium/2026-03-15` |
| Common Voice EN on Apr 1, 2026 | `bench/common-voice-en/2026-04-01` |
| Custom internal dataset | `bench/custom-internal-v2/2026-05-10` |

The branch name uses forward slashes intentionally. Git supports hierarchical
branch names, and this convention groups all benchmark branches under `bench/`,
then by dataset, then by date. This makes branch listing (`git branch --list 'bench/*'`)
and cleanup (`git branch -d bench/librispeech-test-clean/*`) straightforward.

#### 8.2.2 Branch Lifecycle

1. **Creation**: The orchestrator (human or CI) creates the branch from the current
   `main` (or `benchmarking`) branch before any machines begin work.

2. **Accumulation**: Each machine, upon completing its test, commits its result file
   to the branch and pushes. Because each machine writes a unique file (see Section
   8.3), there are no merge conflicts. Machines that push concurrently use
   `git pull --rebase` before pushing to linearize the commit history.

3. **PR Creation**: After all machines have completed (or after a timeout), the
   orchestrator opens a pull request from the branch to the target branch. The PR
   title follows the convention:

   ```
   bench: {dataset}-{subset} {YYYY-MM-DD}
   ```

   For example: `bench: librispeech-test-clean 2026-02-26`

4. **Review**: The PR contains one commit per provider/layer test. Reviewers can
   inspect individual result files, compare metrics against previous runs, and
   verify that the environment and configuration match the methodology.

5. **Merge**: Upon approval, the PR is merged. The result files are now part of the
   repository's permanent history. The branch can be deleted.

6. **Accumulation over time**: Subsequent runs for the same dataset create new
   branches with new dates. After multiple merges, the data directory contains a
   time-series of results organized by date.

#### 8.2.3 Commit Convention

Each machine's commit follows the conventional commit format:

```
bench({layer}): {provider} {model} against {dataset}-{subset}
```

Examples:

- `bench(stt): deepgram nova-3 against librispeech-test-clean`
- `bench(llm): anthropic claude-haiku-4-5 against librispeech-test-clean`
- `bench(tts): elevenlabs eleven_turbo_v2_5 against ljspeech-medium`
- `bench(full-stack): deepgram-anthropic-cartesia against librispeech-test-clean`

### 8.3 File Path Convention

Result files are stored in the repository under a deterministic path that encodes
three dimensions: the dataset (with subset), the date, and the test identity
(layer, provider, model). This path structure enables filesystem-level querying
using standard glob patterns.

#### 8.3.1 Path Structure

```
packages/benchmarking/data/runs/{dataset}-{subset}/{YYYY-MM-DD}/{layer}-{provider}-{model}.json
```

The path components are:

| Component | Format | Example |
|-----------|--------|---------|
| `{dataset}-{subset}` | Lowercase, hyphenated | `librispeech-test-clean` |
| `{YYYY-MM-DD}` | ISO 8601 date | `2026-02-26` |
| `{layer}` | One of: `stt`, `llm`, `tts`, `full-stack` | `stt` |
| `{provider}` | Lowercase provider name | `deepgram` |
| `{model}` | Model identifier, dots replaced with hyphens | `nova-3` |

For full-stack tests, the provider component encodes the entire triple:

```
full-stack-{stt_provider}-{llm_provider}-{tts_provider}.json
```

Example: `full-stack-deepgram-anthropic-cartesia.json`

#### 8.3.2 File Name Determinism

The file name is **fully determined by the test parameters**. Two machines running
the same provider/layer/model combination will produce the same file name. This is
intentional:

- Within a single run, each provider/layer/model combination is assigned to exactly
  one machine. File name collisions do not occur.
- Across runs (different dates), the same file name appears under different date
  directories. This is what enables time-series comparison.
- If a run is retried (same date, same parameters), the new result overwrites the
  previous result at the same path. Git records both versions in history, so the
  overwritten result is not lost.

#### 8.3.3 Example Directory Tree

After several merged benchmark PRs, the data directory accumulates results over time:

```
packages/benchmarking/data/runs/
  librispeech-test-clean/
    2026-02-26/
      stt-deepgram-nova-3.json
      stt-assemblyai-default.json
      llm-anthropic-claude-haiku-4-5.json
      llm-openai-gpt-4o-mini.json
      llm-groq-llama-3-3-70b-versatile.json
      llm-mistral-mistral-small-latest.json
      llm-gemini-gemini-2-0-flash.json
      tts-deepgram-aura-2-thalia-en.json
      tts-openai-tts-1.json
      tts-elevenlabs-eleven_turbo_v2_5.json
      tts-cartesia-sonic-2.json
      full-stack-deepgram-anthropic-cartesia.json
      full-stack-deepgram-openai-openai.json
      full-stack-assemblyai-groq-elevenlabs.json
    2026-03-15/
      stt-deepgram-nova-3.json
      stt-assemblyai-default.json
      llm-anthropic-claude-haiku-4-5.json
      llm-openai-gpt-4o-mini.json
      ...
  ljspeech-medium/
    2026-02-26/
      tts-deepgram-aura-2-thalia-en.json
      tts-openai-tts-1.json
      tts-elevenlabs-eleven_turbo_v2_5.json
      tts-cartesia-sonic-2.json
    2026-03-15/
      tts-deepgram-aura-2-thalia-en.json
      ...
  common-voice-en/
    2026-04-01/
      stt-deepgram-nova-3.json
      stt-assemblyai-default.json
```

### 8.4 Raw Event Log Handling

Each test produces two categories of output: computed metrics (small, structured,
stored in the repository) and raw event logs (large, verbose, stored externally).

#### 8.4.1 Why Raw Logs Are Not Stored in the Repository

Raw event logs (NDJSON files as defined in Section 5.1.4) can be substantial in
size. A single STT benchmark against LibriSpeech test-clean produces approximately
2,620 utterances, each generating 5-20 events, yielding 13,000-52,000 event records.
At approximately 200 bytes per record, this is 2.6-10.4 MB per provider per layer.
A full run across all providers and layers could produce 100+ MB of raw event data.

Storing this volume of data in the git repository would:

1. Bloat the repository size permanently (git never forgets, even if files are
   later deleted).
2. Make PRs impractical to review (tens of thousands of lines of JSON).
3. Slow down `git clone` for all contributors.
4. Violate the principle of keeping the repository focused on methodology and
   computed results.

#### 8.4.2 Provenance via Cryptographic Hash

To satisfy the Proveable principle (Section 1.3) without storing raw logs in the
repository, each result file includes a SHA-256 hash of the raw event log that
produced it:

```jsonc
{
  "rawLog": {
    "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "byteSize": 5242880,
    "eventCount": 26200,
    "storagePath": "s3://composite-voice-benchmarks/runs/2026-02-26/stt-deepgram-nova-3.events.ndjson"
  }
}
```

This hash serves as a cryptographic proof that the computed metrics derive from a
specific, unmodified event log. Any party with access to the raw log can:

1. Verify the hash matches: `sha256sum events.ndjson`
2. Recompute all metrics from the raw events.
3. Confirm that the metrics in the result file are correct.

The `storagePath` field is informational — it indicates where the raw log was
stored at the time of the benchmark run. Storage locations may include CI artifact
stores, S3 buckets, or other external systems. The hash is the authoritative
provenance link, not the path.

#### 8.4.3 Local Raw Log Retention

During benchmark execution, raw event logs are written to a local temporary
directory on the machine running the test. The benchmark runner:

1. Writes events to `{tmpdir}/{runId}/{layer}-{provider}-{model}.events.ndjson`
   in real time as events are captured.
2. After all trials complete, computes the SHA-256 hash of the complete log file.
3. Includes the hash in the result file (Section 9).
4. Optionally uploads the raw log to an external store (configurable).
5. The local file is retained until the machine is decommissioned or explicitly
   cleaned up.

---

## 9. Result File Schema

Each test — one provider, one layer, one dataset — produces exactly one result
file. The result file is self-contained: it includes everything needed to
understand what was tested, how it was tested, what the environment looked like,
and what the results were. A reader should never need to cross-reference another
file to interpret a result file.

### 9.1 Schema Version

Every result file begins with a `schema` field indicating the version of the
result file format. This allows the visualization and comparison tooling to
handle format evolution gracefully.

```jsonc
{
  "schema": 1
}
```

When the schema changes in a backwards-incompatible way, the version number
increments. Tooling must refuse to process a schema version it does not
understand, rather than silently producing incorrect results.

### 9.2 Complete Result File Structure

```jsonc
{
  // --- Identity ---
  "schema": 1,
  "testId": "550e8400-e29b-41d4-a716-446655440000",  // UUID v4, unique per test execution
  "timestamp": "2026-02-26T14:30:00Z",                // ISO 8601, UTC, test start time

  // --- What Was Tested ---
  "dataset": "librispeech",
  "subset": "test-clean",
  "layer": "stt",                                      // "stt" | "llm" | "tts" | "full-stack"
  "provider": "deepgram",
  "model": "nova-3",
  "tier": "fast",                                      // "fast" | "balanced" | "quality"

  // --- How It Was Configured ---
  "config": {
    "language": "en-US",
    "interimResults": true,
    "encoding": "linear16",
    "sampleRate": 16000,
    "channels": 1,
    "punctuation": false,
    "profanityFilter": false,
    "diarize": false,
    "smartFormat": false,
    "redact": [],
    "keywords": [],
    "vadEvents": false
    // All fields from the Feature Alignment Protocol (Section 3) for this layer
  },

  // --- Where It Ran ---
  "environment": {
    "hardware": {
      "cpu": "Apple M2 Pro, 12-core",
      "ram": "32 GB",
      "gpu": null,
      "network": "Ethernet",
      "disk": "NVMe SSD"
    },
    "software": {
      "os": "macOS 14.3",
      "nodeVersion": "v20.11.0",
      "sdkVersion": "0.0.1",
      "sdkCommit": "abc123def456",
      "pnpmVersion": "8.15.1"
    },
    "network": {
      "isp": "AWS us-east-1",
      "geography": "Virginia, USA",
      "pingToProvider": {
        "host": "api.deepgram.com",
        "meanMs": 15,
        "stdDevMs": 2.3
      },
      "bandwidthDown": "1000 Mbps",
      "bandwidthUp": "1000 Mbps"
    },
    "providerVersions": {
      "apiVersion": "v1",
      "sdkPackage": "@deepgram/sdk@4.11.2"
    }
  },

  // --- What Happened ---
  "summary": {
    "trialCount": 2620,
    "errorCount": 3,
    "errorRate": 0.0011,
    "warmUpTrials": 3,
    "cooldownMs": 2000,
    "timeoutMs": 30000,
    "totalDurationMs": 1847200
  },

  // --- The Results ---
  "metrics": {
    "ttfp": {
      "unit": "ms",
      "mean": 245.3,
      "median": 230.0,
      "p90": 310.5,
      "p95": 345.2,
      "p99": 412.8,
      "min": 120.1,
      "max": 890.3,
      "stdDev": 65.4,
      "cv": 0.267,
      "sampleSize": 2617,
      "outliers": {
        "count": 4,
        "method": "3x IQR",
        "indices": [102, 1503, 2001, 2450],
        "values": [890.3, 820.1, 795.6, 780.2]
      }
    },
    "ttft": { /* same structure */ },
    "transcriptionLatency": { /* same structure */ },
    "wer": {
      "unit": "percent",
      "mean": 4.2,
      "median": 3.8,
      "p90": 8.1,
      "p95": 10.5,
      "p99": 15.2,
      "min": 0.0,
      "max": 22.3,
      "stdDev": 3.1,
      "cv": 0.738,
      "sampleSize": 2617,
      "outliers": {
        "count": 7,
        "method": "3x IQR",
        "indices": [45, 890, 1234, 1567, 1890, 2100, 2345],
        "values": [22.3, 20.1, 19.8, 18.5, 17.9, 17.2, 16.8]
      }
    },
    "confidence": { /* same structure, unit: "score" (0-1) */ },
    "errorRate": { /* single value, unit: "percent" */ }
  },

  // --- Provenance ---
  "rawLog": {
    "hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "byteSize": 5242880,
    "eventCount": 26200,
    "storagePath": null
  },

  // --- Dataset Integrity ---
  "datasetManifest": {
    "name": "librispeech",
    "subset": "test-clean",
    "version": "2015-12-15",
    "sourceUrl": "http://www.openslr.org/12/",
    "archiveHash": "sha256:39fde525e59672dc6d1551919b1478f724e3b84ed4c67e2c0f5adf3e8b1e2c44",
    "sampleCount": 2620,
    "totalDurationSec": 19440
  }
}
```

### 9.3 Layer-Specific Metric Keys

The `metrics` object contains different keys depending on the layer under test.
The following tables enumerate the exact metric keys present for each layer.
All metrics use the statistical summary structure shown in Section 9.2 unless
otherwise noted.

#### 9.3.1 STT Metrics

| Key | Unit | Definition |
|-----|------|-----------|
| `ttfp` | ms | Time to First Partial (Section 5.2.3) |
| `ttft` | ms | Time to Final Transcript (Section 5.2.3) |
| `transcriptionLatency` | ms | Transcription Latency (Section 5.2.3) |
| `wer` | percent | Word Error Rate (Appendix B) |
| `confidence` | score (0-1) | Mean confidence from `transcription.speechFinal` |
| `errorRate` | percent | Proportion of trials producing errors |

#### 9.3.2 LLM Metrics

| Key | Unit | Definition |
|-----|------|-----------|
| `ttft` | ms | Time to First Token (Section 5.3.3) |
| `tgt` | ms | Total Generation Time (Section 5.3.3) |
| `tps` | tokens/s | Tokens Per Second (Section 5.3.3) |
| `itl` | ms | Inter-Token Latency (Section 5.3.3) |
| `outputLength` | chars | Character count of complete response |
| `tokenCount` | tokens | Provider-reported token usage (where available) |
| `errorRate` | percent | Proportion of trials producing errors |

#### 9.3.3 TTS Metrics

| Key | Unit | Definition |
|-----|------|-----------|
| `ttfa` | ms | Time to First Audio (Section 5.4.3) |
| `tst` | ms | Total Synthesis Time (Section 5.4.3) |
| `audioChunkCount` | count | Number of `tts.audio` events per trial |
| `audioDataVolume` | bytes | Sum of audio chunk byte lengths |
| `synthesisThroughput` | words/s | Input words per second of synthesis time |
| `icl` | ms | Inter-Chunk Latency (Section 5.4.3) |
| `errorRate` | percent | Proportion of trials producing errors |

#### 9.3.4 Full-Stack Metrics

| Key | Unit | Definition |
|-----|------|-----------|
| `e2e` | ms | End-to-End Latency (Section 5.5.4) |
| `prt` | ms | Perceived Response Time (Section 5.5.4) |
| `sttSegment` | ms | STT processing segment (Section 5.5.4) |
| `handoffSttToLlm` | ms | STT→LLM handoff latency (Section 5.5.4) |
| `llmSegment` | ms | LLM processing segment (Section 5.5.4) |
| `handoffLlmToTts` | ms | LLM→TTS handoff latency (Section 5.5.4) |
| `ttsSegment` | ms | TTS processing segment (Section 5.5.4) |
| `pipelineOverhead` | ms | Pipeline Overhead (Section 5.5.4) |
| `errorRate` | percent | Proportion of trials producing errors |

### 9.4 Full-Stack Provider Encoding

Full-stack result files test a provider triple (STT + LLM + TTS). The `provider`
and `model` fields encode the full triple:

```jsonc
{
  "layer": "full-stack",
  "provider": "deepgram-anthropic-cartesia",
  "model": "nova-3_claude-haiku-4-5_sonic-2",
  "tier": "fast",
  "providerDetail": {
    "stt": { "provider": "deepgram", "model": "nova-3" },
    "llm": { "provider": "anthropic", "model": "claude-haiku-4-5" },
    "tts": { "provider": "cartesia", "model": "sonic-2" }
  }
}
```

The `providerDetail` object provides structured access to individual provider
information. The `provider` and `model` top-level fields provide a flattened
string representation suitable for file naming and display.

---

## 10. Querying and Comparison

The file path convention (Section 8.3) encodes three queryable dimensions —
**dataset/subset**, **date**, and **layer/provider/model** — directly into the
filesystem hierarchy. This means that standard glob patterns, applied to the
data directory, serve as a query language for benchmark results. No database,
no index file, no specialized tooling is required to find and compare results.

### 10.1 Query Patterns

The following table enumerates the most common queries and the glob patterns
that answer them. All patterns are relative to `packages/benchmarking/data/runs/`.

| Query | Glob Pattern |
|-------|-------------|
| All results for a specific provider over time | `librispeech-test-clean/*/stt-deepgram-nova-3.json` |
| All STT providers on a specific date | `librispeech-test-clean/2026-02-26/stt-*.json` |
| All layers for one provider on one date | `librispeech-test-clean/2026-02-26/*-deepgram-*.json` |
| Everything from one run | `librispeech-test-clean/2026-02-26/*.json` |
| All TTS results across all datasets and dates | `**/tts-*.json` |
| All full-stack results involving Anthropic LLM | `**/full-stack-*-anthropic-*.json` |
| Compare a provider across different datasets | `*/2026-02-26/stt-deepgram-nova-3.json` |
| All results for a dataset across all dates | `librispeech-test-clean/**/*.json` |
| All results for all datasets on a specific date | `*/2026-02-26/*.json` |

### 10.2 Git-Native Diffing

Because result files are JSON and committed to git, standard git tooling provides
powerful comparison capabilities without any custom infrastructure.

#### 10.2.1 Diff Between Dates

To compare a provider's performance between two benchmark dates:

```bash
git diff main~5:packages/benchmarking/data/runs/librispeech-test-clean/2026-02-26/stt-deepgram-nova-3.json \
         main:packages/benchmarking/data/runs/librispeech-test-clean/2026-03-15/stt-deepgram-nova-3.json
```

This produces a line-level diff of the JSON, showing exactly which metrics changed
and by how much. Because the JSON structure is stable (same keys in the same order),
the diff is human-readable without tooling.

#### 10.2.2 History of a Single Provider

To see how a provider's metrics have evolved across all benchmark runs:

```bash
git log --all --oneline -- packages/benchmarking/data/runs/librispeech-test-clean/*/stt-deepgram-nova-3.json
```

Each commit in the log corresponds to a benchmark run. The commit message
(Section 8.2.3) provides context, and the commit diff shows the result file
that was added.

#### 10.2.3 PR as Review Surface

Each benchmark PR contains one commit per provider test. Reviewers can:

1. Inspect the "Files changed" tab to see all result files from the run.
2. Click into any individual result file to see the full metrics.
3. If the same dataset/date was previously committed (re-run scenario), GitHub
   shows the diff against the previous version.
4. Use PR comments to flag anomalies, request re-runs, or discuss results.

The PR description should include a summary table of key metrics across all
providers tested in the run, generated by the benchmark tooling at PR creation
time.

### 10.3 Programmatic Access

For visualization, infographic generation, and automated comparison, result files
are read programmatically. The query pattern is:

1. Glob the data directory for the desired files (using patterns from Section 10.1).
2. Parse each JSON file.
3. Extract the `metrics` object.
4. Aggregate, compare, or visualize.

Because every result file is self-contained (Section 9), no joins or lookups
are required. The file contains the provider identity, environment, configuration,
and metrics — everything needed to produce a chart, table, or comparison.

#### 10.3.1 Time-Series Construction

To construct a time-series for a single provider:

1. Glob: `{dataset}-{subset}/*/stt-deepgram-nova-3.json`
2. For each file, extract the `timestamp` and `metrics.ttfp.median` (or any metric).
3. Sort by timestamp.
4. Plot.

The date is embedded in both the file path (directory name) and the file content
(`timestamp` field). The directory name is the date of the run; the `timestamp`
field is the precise start time. Use the directory name for grouping and the
`timestamp` field for precise ordering.

#### 10.3.2 Cross-Provider Comparison

To compare all STT providers on a single date:

1. Glob: `{dataset}-{subset}/{date}/stt-*.json`
2. For each file, extract `provider`, `model`, and the target metric.
3. Rank by the metric.
4. Compute pairwise statistical significance (Section 6.3) if raw trial data
   is available.

#### 10.3.3 Cross-Dataset Comparison

To understand how a provider performs on different datasets:

1. Glob: `*/{date}/stt-deepgram-nova-3.json`
2. For each file, extract `dataset`, `subset`, and the target metric.
3. Compare metrics across datasets to assess robustness.

### 10.4 Comparison Report Generation

The benchmark tooling can generate comparison reports from stored result files.
These reports are not stored in the repository — they are ephemeral analysis
artifacts produced on demand.

```jsonc
{
  "comparison": {
    "dataset": "librispeech",
    "subset": "test-clean",
    "date": "2026-02-26",
    "layer": "stt",
    "metric": "ttfp",
    "providers": [
      { "provider": "deepgram", "model": "nova-3", "mean": 245.3, "median": 230.0, "p95": 345.2 },
      { "provider": "assemblyai", "model": "default", "mean": 310.7, "median": 295.0, "p95": 420.1 }
    ],
    "pairwise": [
      {
        "a": { "provider": "deepgram", "model": "nova-3" },
        "b": { "provider": "assemblyai", "model": "default" },
        "difference": {
          "absolute": -65.4,
          "relative": -21.0,
          "confidenceInterval95": [-72.1, -58.7],
          "pValue": 0.00001,
          "cohensD": 0.85,
          "significant": true
        }
      }
    ]
  }
}
```

### 10.5 Infographic Generation

Stored result files are the data source for infographic generation. The infographic
tooling reads result files from the data directory and produces visual artifacts
(SVG, PNG) suitable for documentation, social media, and presentations.

Infographic generation is **not** part of the benchmark run itself. It is a
post-processing step that operates on the accumulated data in the repository.
The tooling is part of the `packages/benchmarking` package and can be run at
any time against the current state of the data directory.

Potential infographic types include:

| Type | Data Source | Visualization |
|------|------------|---------------|
| Provider comparison (single date) | `{dataset}/{date}/stt-*.json` | Grouped bar chart of key metrics |
| Provider trend (over time) | `{dataset}/*/stt-deepgram-*.json` | Line chart of metric over dates |
| Full-stack pipeline breakdown | `{dataset}/{date}/full-stack-*.json` | Stacked bar chart of STT/LLM/TTS segments |
| Heatmap (provider x metric) | `{dataset}/{date}/*.json` | Heatmap grid with color-coded performance |
| Dataset robustness | `*/{date}/stt-deepgram-*.json` | Radar chart across datasets |

---

## 11. Reproducibility Contract

This section defines the commitments required for a benchmark run to be considered
valid and reproducible. The distributed execution model (Section 8.1) and
git-based storage (Sections 8.2-8.3) introduce additional reproducibility
requirements beyond those of a single-machine benchmark.

### 11.1 Pre-Run Checklist

Before executing a benchmark run, the orchestrator must verify:

- [ ] Target branch has been created from the current target base branch.
- [ ] Dataset version matches the pinned version in the methodology (Section 4).
- [ ] Dataset is accessible to all machines that will participate in the run.
- [ ] All provider API keys are valid and have sufficient quota for the full trial
      count plus warm-up trials.
- [ ] Feature alignment configuration matches Section 3 exactly. The configuration
      is distributed to all machines identically (not configured per-machine).
- [ ] Warm-up protocol is configured (3 trials, discarded) on every machine.
- [ ] Network conditions are recorded on every machine (ping to the assigned
      provider's API endpoint) before the run begins.
- [ ] No other significant network activity on any benchmark machine.
- [ ] System clocks on all machines are synchronized (NTP or equivalent). Clock
      skew between machines does not affect results (each machine uses only its
      own clock), but synchronized clocks ensure that the `timestamp` field in
      result files is comparable across machines.
- [ ] CompositeVoice SDK version is identical on all machines (same git commit hash).
- [ ] Node.js version is identical on all machines.

### 11.2 Post-Run Validation

After all machines have completed and pushed their results:

- [ ] All expected result files are present on the branch. If K providers across
      L layers were tested, there should be K*L result files (or fewer if some
      combinations are not applicable).
- [ ] Error rate is below 10% for each provider/layer test.
- [ ] `rawLog.hash` is present in every result file.
- [ ] `environment` is fully populated in every result file.
- [ ] `config` matches the Feature Alignment Protocol (Section 3) in every file.
- [ ] `datasetManifest.archiveHash` is identical across all result files in the
      run (proving all machines used the same dataset).
- [ ] `environment.software.sdkCommit` is identical across all result files
      (proving all machines used the same SDK version).
- [ ] No anomalous network conditions are noted in any machine's environment
      data (check `pingToProvider.stdDevMs` — flag if > 20% of `meanMs`).

### 11.3 Version Pinning

| Artifact | Pinning Method | Verified In |
|----------|---------------|-------------|
| Dataset (any) | Download URL + SHA-256 of archive | `datasetManifest.archiveHash` |
| Prompt Set (LLM) | SHA-256 of `prompts.json` | `datasetManifest.archiveHash` |
| SDK Version | Git commit hash | `environment.software.sdkCommit` |
| Node.js | Exact version string | `environment.software.nodeVersion` |
| Provider SDKs | `pnpm-lock.yaml` hash | `environment.providerVersions.sdkPackage` |
| Methodology | Git commit hash of `METHODOLOGY.md` | Branch base commit |

### 11.4 Replication Instructions

To replicate a benchmark run, a third party needs:

1. This methodology document at the version indicated by the branch's base commit.
2. Any result file from the run (each is self-contained with full configuration
   and environment metadata).
3. The dataset at the version indicated by `datasetManifest.archiveHash`.
4. Valid API keys for the providers under test.
5. A machine with comparable hardware and network characteristics (documented in
   the result file's `environment` for reference).

A replication is considered **successful** if the replicated metrics fall within
the **95% confidence interval** of the original run's metrics, after accounting
for documented differences in:

- Network latency (different geography or ISP).
- Hardware specifications (different CPU, RAM).
- Provider API version (if the provider has updated its model between runs).

Differences attributable to these factors must be called out explicitly in the
replication report. Differences not attributable to these factors indicate either
a methodology violation or a genuine change in provider performance.

### 11.5 Conflict Resolution

In the event that two machines attempt to push to the same branch concurrently:

1. The second machine's `git push` will fail.
2. The machine must `git pull --rebase` to incorporate the first machine's commit.
3. Because each machine writes a unique file (Section 8.3.2), the rebase will
   succeed without conflicts.
4. The machine retries `git push`.
5. If the push fails again (a third machine pushed in the interim), repeat steps
   2-4 up to 5 times.
6. After 5 failed attempts, the machine logs an error and saves the result file
   locally for manual recovery.

This conflict resolution strategy is simple and robust because file name
determinism (Section 8.3.2) guarantees that concurrent pushes never modify the
same file. The only contention is on the branch ref, which `git pull --rebase`
resolves by linearizing commits.

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **TTFP** | Time to First Partial — latency from audio input start to first interim transcription |
| **TTFT** | Time to First Token — latency from LLM request to first streamed token |
| **TTFA** | Time to First Audio — latency from TTS request to first audio chunk |
| **TGT** | Total Generation Time — full LLM response duration |
| **TST** | Total Synthesis Time — full TTS synthesis duration |
| **PRT** | Perceived Response Time — user-facing latency from end-of-speech to first audio playback |
| **E2E** | End-to-End — total pipeline latency from audio input to audio output |
| **WER** | Word Error Rate — standard STT accuracy metric (lower is better) |
| **ITL** | Inter-Token Latency — time between consecutive LLM streaming tokens |
| **ICL** | Inter-Chunk Latency — time between consecutive TTS audio chunks |
| **IQR** | Interquartile Range — P75 minus P25, used for outlier detection |
| **CV** | Coefficient of Variation — standard deviation divided by mean |
| **PRT** | Perceived Response Time — first TTS audio after user stops speaking |

### Appendix B: WER Computation

Word Error Rate is computed as:

```
WER = (S + D + I) / N
```

Where:
- **S** = Substitutions (wrong words)
- **D** = Deletions (missing words)
- **I** = Insertions (extra words)
- **N** = Total words in reference

Computed using dynamic programming (Levenshtein distance at word level).

Both reference and hypothesis are preprocessed:
1. Convert to lowercase.
2. Remove all punctuation.
3. Collapse multiple spaces to single space.
4. Trim leading/trailing whitespace.
5. Split on whitespace to produce word arrays.

### Appendix C: Future Extensions

The following are explicitly **out of scope** for the initial methodology but are
anticipated future additions:

1. **Multilingual benchmarks** — Using Common Voice subsets for non-English STT.
2. **Audio quality metrics** — PESQ, POLQA, or MOS scoring for TTS output.
3. **Concurrent load testing** — Multiple simultaneous sessions per provider.
4. **Cost-per-query analysis** — Mapping latency to provider pricing.
5. **Voice cloning quality** — Speaker similarity metrics using VCTK.
6. **Eager pipeline benchmarks** — Measuring speculative LLM generation via
   `transcription.preflight` events.
7. **Audio playback instrumentation** — Wiring `audio.playback.start/end` events
   for true end-to-end measurement.
