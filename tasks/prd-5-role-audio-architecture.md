# PRD: 5-Role Audio Architecture Redesign

## Overview

The composite-voice SDK has a race condition where Deepgram misses the first audio frames because `stt.connect()` (WebSocket handshake) completes before `audioCapture.start()` (getUserMedia + AudioContext setup). Audio I/O is tangled into the orchestrator rather than being a pluggable concern, and the SDK is browser-only because `AudioCapture` depends on `getUserMedia`.

This redesign:
1. Fixes the race condition by buffering audio in a queue that drains when the STT is ready
2. Promotes audio I/O to first-class providers (5 roles: `input`, `stt`, `llm`, `tts`, `output`)
3. Enables multi-role providers via an array-based config (e.g., NativeSTT covers `input`+`stt`)
4. Adds format detection and header preservation for WebSocket reconnection scenarios
5. Enables Node/Bun/Deno by making browser APIs optional (users provide custom input/output)

### Pipeline Transformation

```
CURRENT:
[getUserMedia] -> AudioCapture -> stt.sendAudio() -> [WebSocket] -> transcription
[speakers] <-- AudioPlayer <-- tts.onAudio() <-- [WebSocket] <-- LLM response

TARGET:
[InputProvider] -> InputQueue -> [STTProvider] -> transcription
[OutputProvider] <-- OutputQueue <-- [TTSProvider] <-- LLM response
```

## Goals

- Eliminate the race condition where first audio frames are lost during STT WebSocket handshake
- Decouple audio I/O from the orchestrator into pluggable `AudioInputProvider` and `AudioOutputProvider` interfaces
- Enable server-side (Node/Bun/Deno) usage via `BufferInput` and `NullOutput` providers
- Maintain backward compatibility for all existing provider implementations (DeepgramSTT, AnthropicLLM, etc.)
- Replace `{ stt, llm, tts }` config with `providers: [...]` array supporting multi-role providers
- Add audio format detection and header caching for robust WebSocket reconnection
- All 28 existing examples updated to the new config format and verified building

## Quality Gates

These commands must pass for every user story:
- `pnpm test` — Full test suite
- `pnpm tsc --noEmit` — Type checking

For example update stories, also include:
- `pnpm build` in the example directory — Verify the example builds successfully

## Documentation Standard

This codebase generates API documentation via TypeDoc. Every new interface, class, type, property, method, parameter, and constant must have comprehensive TSDoc matching the existing style in `src/core/types/providers.ts`, `src/core/types/audio.ts`, and `src/core/types/config.ts`.

### Required TSDoc elements:

**Module-level (`@packageDocumentation`):**
- Every new `.ts` file must start with a module-level JSDoc block including `@packageDocumentation` and `@remarks` explaining the module's purpose and relationship to the rest of the SDK.

**Interfaces and classes:**
- Summary sentence
- `@remarks` block explaining purpose, design rationale, lifecycle, and relationship to other types
- `@example` block with realistic usage code (imports, construction, method calls)
- `@see` links to related types, base classes, and concrete implementations
- ASCII data-flow diagrams for pipeline components (matching the style in `LiveSTTProvider`, `DeepgramSTT`, `AudioCapture`)

**Properties:**
- Summary sentence
- `@remarks` explaining when/why to use the property
- `@defaultValue` for optional properties with defaults
- `@see` links to the type definition

**Methods:**
- Summary sentence
- `@remarks` explaining behavior, edge cases, and lifecycle requirements
- `@param` for every parameter with full description
- `@returns` with description of the return value
- `@throws` for every error condition with the error class name
- `@example` for non-trivial methods

**Types and enums:**
- Summary sentence
- `@remarks` explaining each possible value and when to use it

**Constants:**
- Summary sentence
- `@remarks` explaining how defaults were chosen

## User Stories

### US-001: Define core types and roles
**Description:** As a developer, I want `ProviderRole`, `AudioInputProvider`, `AudioOutputProvider`, and `ResolvedPipeline` types defined so that all subsequent stories can build on them.

**Acceptance Criteria:**
- [ ] Create `src/core/types/roles.ts` with `ProviderRole` type (`'input' | 'stt' | 'llm' | 'tts' | 'output'`) and `ALL_PROVIDER_ROLES` constant
- [ ] Add `readonly roles: readonly ProviderRole[]` to `BaseProvider` interface in `src/core/types/providers.ts`
- [ ] Remove `managedAudio` property entirely from `BaseProvider` interface in `src/core/types/providers.ts`
- [ ] Add `AudioInputProvider` interface extending `BaseProvider` with methods: `start()`, `stop()`, `pause()`, `resume()`, `isActive()`, `onAudio(callback)`, `getMetadata()`
- [ ] Add `AudioOutputProvider` interface extending `BaseProvider` with methods: `configure(metadata)`, `enqueue(chunk)`, `flush()`, `stop()`, `pause()`, `resume()`, `isPlaying()`, `onPlaybackStart(callback)`, `onPlaybackEnd(callback)`, `onPlaybackError(callback)`
- [ ] Add `ResolvedPipeline` interface with typed slots: `input: AudioInputProvider`, `stt: STTProvider`, `llm: LLMProvider`, `tts: TTSProvider`, `output: AudioOutputProvider`
- [ ] Update `src/providers/base/BaseProvider.ts`: set `roles = []`, remove `managedAudio` property
- [ ] Update `src/providers/base/BaseSTTProvider.ts`: set `roles = ['stt']`
- [ ] Update `src/providers/base/BaseLLMProvider.ts`: set `roles = ['llm']`
- [ ] Update `src/providers/base/BaseTTSProvider.ts`: set `roles = ['tts']`
- [ ] Export new types from `src/core/types/index.ts`
- [ ] All TSDoc follows the Documentation Standard (module-level `@packageDocumentation`, `@remarks`, `@example`, `@see` links, ASCII diagrams for pipeline types)
- [ ] All existing tests pass with no behavioral change

### US-002: Implement AudioBufferQueue
**Description:** As the SDK, I want a bounded FIFO queue between pipeline stages so that audio frames are buffered during STT connection and flushed when ready.

**Acceptance Criteria:**
- [ ] Create `src/core/pipeline/AudioBufferQueue.ts` with `AudioBufferQueue` class and `AudioBufferQueueConfig` interface
- [ ] `enqueue(chunk)` adds to queue; if draining, passes through directly (zero-copy fast path)
- [ ] `startDraining(callback)` flushes all buffered chunks immediately, then switches to pass-through mode
- [ ] `stopDraining()` returns to buffering mode
- [ ] Overflow strategy: `drop-oldest` (default), configurable via `overflowStrategy` (`'drop-oldest' | 'drop-newest' | 'block'`)
- [ ] Configurable `maxSize` (default 1000) and required `name` for diagnostics
- [ ] `peek()`, `size` getter, `clear()`, and `getStats()` methods for observability
- [ ] `getStats()` returns `QueueStats` with `size`, `totalEnqueued`, `totalDequeued`, `totalDropped`, `oldestChunkAge`
- [ ] Create `tests/unit/core/pipeline/AudioBufferQueue.test.ts` with tests for: enqueue/dequeue ordering, drain flushes N buffered chunks then switches to pass-through, overflow drops oldest when full, stopDraining returns to buffer mode
- [ ] All TSDoc follows the Documentation Standard

### US-003: Implement format detection and header cache
**Description:** As the SDK, I want to detect audio container formats via magic bytes and cache headers so that WebSocket reconnections can re-inject the container header.

**Acceptance Criteria:**
- [ ] Create `src/utils/audioFormat.ts` with `detectAudioFormat(buffer)` function returning detected format or `null` for PCM/unknown
- [ ] Support magic-byte detection for: WAV (RIFF+WAVE), OGG (OggS), MP3 (ID3 or sync word), AAC (ADTS), WebM (EBML), FLAC (fLaC), AIFF (FORM+AIFF), MP4 (ftyp)
- [ ] Require minimum 12 bytes (`MIN_SNIFF_BYTES` constant) for detection
- [ ] Create `extractHeader(buffer, format)` function for format-specific header extraction
- [ ] Create `DetectedAudioFormat` type documenting all supported format values
- [ ] Create `src/core/pipeline/AudioHeaderCache.ts` with `AudioHeaderCache` class
- [ ] `AudioHeaderCache.process(chunk)` accumulates chunks until 12+ bytes for sniffing, then caches the container header
- [ ] `AudioHeaderCache.getHeader()` returns cached header for re-injection on reconnect
- [ ] `AudioHeaderCache.reset()` clears for new stream
- [ ] Create unit tests for: each detected format, undersized buffers, PCM fallback, header extraction, cache accumulation and reset
- [ ] Reference `magic-frame-detection.md` design document in TSDoc
- [ ] All TSDoc follows the Documentation Standard

### US-004: Implement MicrophoneInput provider
**Description:** As a browser user, I want a `MicrophoneInput` provider that wraps `AudioCapture` so that microphone input is a first-class pipeline role.

**Acceptance Criteria:**
- [ ] Create `src/providers/input/MicrophoneInput.ts` implementing `AudioInputProvider`
- [ ] Set `roles: ['input']`
- [ ] `start()` calls `AudioCapture.start()`, wraps raw `ArrayBuffer` into `AudioChunk` with metadata and sequence number
- [ ] `stop()` calls `AudioCapture.stop()`
- [ ] `pause()` calls `AudioCapture.pause()`
- [ ] `resume()` calls `AudioCapture.resume()`
- [ ] `isActive()` delegates to `AudioCapture.isCapturing()`
- [ ] `onAudio(callback)` registers callback that receives `AudioChunk` objects
- [ ] `getMetadata()` returns `AudioMetadata` with `{ sampleRate, encoding: 'linear16', channels, bitDepth: 16 }` from config
- [ ] Config compatible with existing `AudioInputConfig`
- [ ] Create `src/providers/input/index.ts` barrel export
- [ ] All TSDoc follows the Documentation Standard including data-flow diagram

### US-005: Implement BrowserAudioOutput provider
**Description:** As a browser user, I want a `BrowserAudioOutput` provider that wraps `AudioPlayer` so that speaker playback is a first-class pipeline role.

**Acceptance Criteria:**
- [ ] Create `src/providers/output/BrowserAudioOutput.ts` implementing `AudioOutputProvider`
- [ ] Set `roles: ['output']`
- [ ] `configure(metadata)` delegates to `AudioPlayer.setMetadata()`
- [ ] `enqueue(chunk)` delegates to `AudioPlayer.addChunk()`
- [ ] `flush()` delegates to `AudioPlayer.waitForCompletion()`
- [ ] `stop()` delegates to `AudioPlayer.stop()`
- [ ] `pause()` delegates to `AudioPlayer.pause()`
- [ ] `resume()` delegates to `AudioPlayer.resume()`
- [ ] `isPlaying()` delegates to `AudioPlayer.isPlaying()`
- [ ] Playback callbacks (`onPlaybackStart`, `onPlaybackEnd`, `onPlaybackError`) wired to AudioPlayer lifecycle via `setCallbacks()`
- [ ] Config compatible with existing `AudioOutputConfig`
- [ ] Create `src/providers/output/index.ts` barrel export
- [ ] All TSDoc follows the Documentation Standard including data-flow diagram

### US-006: Implement BufferInput and NullOutput
**Description:** As a server-side developer, I want non-browser input/output providers so that I can run the pipeline in Node/Bun/Deno.

**Acceptance Criteria:**
- [ ] Create `src/providers/input/BufferInput.ts` implementing `AudioInputProvider` with `roles: ['input']`
- [ ] `BufferInput` constructor takes `AudioMetadata` (user-specified format info)
- [ ] `push(data: ArrayBuffer)` method allows application to push audio into pipeline
- [ ] Chunks pushed before `start()` are silently dropped
- [ ] No browser dependencies (no `navigator`, `window`, `AudioContext`)
- [ ] Create `src/providers/output/NullOutput.ts` implementing `AudioOutputProvider` with `roles: ['output']`
- [ ] All `NullOutput` methods are no-ops; no browser dependencies
- [ ] Export both from `src/providers/input/index.ts` and `src/providers/output/index.ts`
- [ ] All TSDoc follows the Documentation Standard with Node.js usage examples

### US-007: Implement provider resolution algorithm
**Description:** As the SDK, I want a `resolveProviders()` function that maps a flat provider array to a `ResolvedPipeline` so that any combination of single-role and multi-role providers can be validated and assigned.

**Acceptance Criteria:**
- [ ] Create `src/core/pipeline/resolveProviders.ts` with `resolveProviders(providers: BaseProvider[]): ResolvedPipeline` function
- [ ] Read `roles` from each provider and assign to pipeline slots
- [x] **Default providers:** When `input` and `stt` roles are both uncovered, auto-fill with `new NullInput()` (covers `input`+`stt` — text-only mode). When `tts` and `output` roles are both uncovered, auto-fill with `new NullOutput()` (covers `tts`+`output` — text-only mode). When `stt` provided without `input`, auto-fill `MicrophoneInput()`. When `tts` provided without `output`, auto-fill `BrowserAudioOutput()`. When `llm` uncovered, auto-fill `AnthropicLLM({ model: 'claude-haiku-4-5' })`.
- [ ] Throw `ConfigurationError` for uncovered roles that cannot be auto-filled (e.g., `llm` always required, partial coverage like only `input` uncovered)
- [ ] Throw `ConfigurationError` for duplicate roles with message naming both conflicting providers
- [ ] Duck-type check: verify each slot has required methods for its role interface (`AudioInputProvider` for `input`, `LiveSTTProvider`/`RestSTTProvider` for `stt`, `LLMProvider` for `llm`, `LiveTTSProvider`/`RestTTSProvider` for `tts`, `AudioOutputProvider` for `output`)
- [ ] Resolution examples: `[anyLLM]` resolves with NativeSTT+NativeTTS defaults; `[nativeSTT, anyLLM, nativeTTS]` resolves multi-role explicitly; `[mic, dgSTT, llm, dgTTS, audio]` resolves all 5 slots
- [ ] Create `src/core/pipeline/index.ts` barrel export
- [ ] Create unit tests for: minimal 1-provider resolution (LLM only with defaults), valid 3-provider resolution, valid 5-provider resolution, partial defaults (custom STT + LLM, NativeTTS default), missing LLM throws error, duplicate role error, duck-type validation error
- [ ] All TSDoc follows the Documentation Standard

### US-008: Implement STT metadata auto-configuration
**Description:** As the SDK, I want STT providers auto-configured from the input provider's audio metadata so that users don't need to manually match encoding/sampleRate settings.

**Acceptance Criteria:**
- [ ] Create `src/core/pipeline/configureSTTFromMetadata.ts` with `configureSTTFromMetadata(stt, metadata)` function
- [ ] For DeepgramSTT: sets `options.encoding`, `options.sampleRate`, `options.channels` when not explicitly configured by the user
- [ ] For AssemblyAISTT: sets equivalent config fields when not explicitly configured
- [ ] No-op for providers without compatible config (NativeSTT, ElevenLabsSTT, etc.)
- [ ] Never overwrites user-set values
- [ ] Create unit tests verifying: auto-fill for DeepgramSTT, no-op for NativeSTT, user values preserved
- [ ] All TSDoc follows the Documentation Standard

### US-009: Adapt NativeSTT and NativeTTS to multi-role
**Description:** As a browser user, I want NativeSTT and NativeTTS to declare their multi-role nature so that the resolution algorithm can place them in both input+stt and tts+output slots.

**Acceptance Criteria:**
- [ ] Modify `src/providers/stt/native/NativeSTT.ts`: set `roles: ['input', 'stt']`
- [ ] NativeSTT implements `AudioInputProvider` interface: `start()` delegates to `connect()`, `stop()` delegates to `disconnect()`, `onAudio()` is a no-op (browser consumes audio internally), `getMetadata()` returns sensible defaults, `pause()` and `resume()` delegate appropriately, `isActive()` returns connection state
- [ ] Remove `managedAudio` property from NativeSTT entirely
- [ ] Modify `src/providers/tts/native/NativeTTS.ts`: set `roles: ['tts', 'output']`
- [ ] NativeTTS implements `AudioOutputProvider` interface: `configure()` is a no-op, `enqueue()` is a no-op, `flush()` is a no-op, `isPlaying()` delegates to `isSpeaking()`, playback callbacks wired to synthesis events
- [ ] Remove `managedAudio` property from NativeTTS entirely
- [ ] Update existing NativeSTT and NativeTTS tests to use `roles` instead of `managedAudio`
- [ ] All TSDoc updated to explain multi-role behavior

### US-010: Update CompositeVoice orchestrator
**Description:** As the SDK, I want the CompositeVoice class refactored to use `ResolvedPipeline`, `AudioBufferQueue`, and `AudioHeaderCache` so that the race condition is fixed and audio I/O is fully decoupled.

**Acceptance Criteria:**
- [ ] Constructor calls `resolveProviders()` to produce `ResolvedPipeline` from `config.providers` array
- [ ] Constructor creates input and output `AudioBufferQueue` instances (configurable via `config.queue`)
- [ ] Remove `audioCapture` and `audioPlayer` private fields
- [ ] `initialize()` deduplicates multi-role provider instances (use `Set`) and initializes all unique providers via `Promise.all()`
- [ ] `startListening()` implements the race condition fix: for multi-role input===stt, use simplified path (just connect); otherwise: wire input.onAudio -> headerCache.process -> inputQueue.enqueue, start input provider, auto-configure STT from metadata, connect STT, startDraining inputQueue into stt.sendAudio()
- [ ] TTS output path: tts.onAudio() -> outputQueue.enqueue(), tts.onMetadata() -> pipeline.output.configure(), outputQueue.startDraining() -> pipeline.output.enqueue(); multi-role tts===output uses simplified path
- [ ] Turn-taking pause/resume: pause stops draining -> pauses input -> disconnects STT; resume resumes input -> reconnects STT -> re-injects header -> starts draining
- [ ] `stopListening()` stops draining -> clears queue -> stops input -> disconnects STT -> resets headerCache
- [ ] Add `getQueueStats()` public method returning stats from both queues
- [ ] `dispose()` disposes all unique providers (deduplicated)
- [ ] All existing CompositeVoice tests updated for new config shape
- [ ] All TSDoc updated to reference 5-role pipeline terminology

### US-011: Update CompositeVoiceConfig type
**Description:** As a developer, I want the config type updated to accept `providers: BaseProvider[]` instead of `{ stt, llm, tts }` so that the array-based config is the only API.

**Acceptance Criteria:**
- [ ] Modify `src/core/types/config.ts`: replace `ProviderConfig { stt, llm, tts }` with `providers: BaseProvider[]` on `CompositeVoiceConfig`
- [ ] Remove `ProviderConfig` interface entirely
- [ ] Add optional `queue?: { input?: Partial<AudioBufferQueueConfig>; output?: Partial<AudioBufferQueueConfig> }` to `CompositeVoiceConfig`
- [ ] Remove `AudioConfig.input` and `AudioConfig.output` sub-configs (now provider constructor concerns)
- [ ] Keep `ReconnectionConfig`, `TurnTakingConfig`, `EagerLLMConfig`, `ConversationHistoryConfig` unchanged
- [ ] All TSDoc updated with `@example` blocks showing array-based config
- [ ] No deprecation stubs - clean removal

### US-012: Update public exports
**Description:** As a developer, I want all new types and providers exported from the SDK entry point so that I can import them.

**Acceptance Criteria:**
- [ ] Export `MicrophoneInput`, `BufferInput` from `src/providers/input`
- [ ] Export `BrowserAudioOutput`, `NullOutput` from `src/providers/output`
- [ ] Export `AudioBufferQueue`, `AudioHeaderCache` from `src/core/pipeline`
- [ ] Export types `AudioInputProvider`, `AudioOutputProvider`, `ProviderRole`, `ResolvedPipeline` from `src/core/types`
- [ ] Export `detectAudioFormat`, `extractHeader` from `src/utils`
- [ ] Export `resolveProviders` from `src/core/pipeline`
- [ ] Update `src/index.ts` module-level JSDoc to mention new provider categories
- [ ] Ensure all `export type` entries have inline comments grouping them (matching existing pattern)

### US-013: Add queue event types
**Description:** As a developer, I want queue overflow and stats events so that I can monitor pipeline health.

**Acceptance Criteria:**
- [ ] Add `QueueOverflowEvent` interface to `src/core/events/types.ts` with fields: `type: 'queue.overflow'`, `queueName: string`, `droppedChunks: number`, `currentSize: number`
- [ ] Add `QueueStatsEvent` interface with fields: `type: 'queue.stats'`, `queueName: string`, `size: number`, `totalEnqueued: number`, `totalDequeued: number`, `oldestChunkAge: number`
- [ ] Add both events to `CompositeVoiceEvent` union type
- [ ] Add both events to `EventListenerMap` interface
- [ ] Wire `AudioBufferQueue` overflow events to `CompositeVoice` event emission
- [ ] Wire `getQueueStats()` to emit `QueueStatsEvent`
- [ ] All TSDoc follows the Documentation Standard

### US-014: Integration tests - race condition fix
**Description:** As a developer, I want integration tests proving the race condition is fixed so that audio is never lost during STT connection.

**Acceptance Criteria:**
- [ ] Create `tests/integration/race-condition-fix.test.ts`
- [ ] Test: MockInputProvider produces 5 chunks, then MockLiveSTT connects (delayed), then drain starts - all 5 delivered in order
- [ ] Test: MockInputProvider produces chunks continuously, STT connects mid-stream - no chunks lost
- [ ] Test: Verifies exact sequence: enqueue during connect, flush on startDraining
- [ ] Extend `tests/mocks/MockProviders.ts` with `MockInputProvider` and `MockOutputProvider` implementing the new interfaces

### US-015: Integration tests - multi-role and array config
**Description:** As a developer, I want integration tests for the provider resolution system so that all config patterns are validated.

**Acceptance Criteria:**
- [ ] Create `tests/integration/multi-role-providers.test.ts`
- [ ] Create `tests/integration/array-config.test.ts`
- [ ] Test: `[nativeSTT, mockLLM, nativeTTS]` resolves correctly with multi-role providers filling input+stt and tts+output
- [ ] Test: `[microphone, deepgramSTT, anthropicLLM, deepgramTTS, browserAudio]` resolves all 5 slots
- [ ] Test: `[microphone, deepgramSTT, anthropicLLM, deepgramTTS, nullOutput]` resolves for server-side output
- [ ] Test: `[bufferInput, deepgramSTT, anthropicLLM, deepgramTTS, nullOutput]` resolves for fully server-side pipeline
- [ ] Test: Missing role throws `ConfigurationError` with clear message naming the missing role
- [ ] Test: Duplicate role throws `ConfigurationError` with clear message naming both conflicting providers
- [ ] Test: Provider missing required interface methods throws `ConfigurationError`

### US-016: Update example 01-native-speech
**Description:** As a developer, I want example 01 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update `CompositeVoice` constructor to use `providers: [new NativeSTT(), new AnthropicLLM({...}), new NativeTTS()]`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments in the example
- [ ] `pnpm build` succeeds in the example directory

### US-017: Update example 02-openai-llm
**Description:** As a developer, I want example 02 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new NativeSTT(), new OpenAILLM({...}), new NativeTTS()]`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-018: Update example 03-webllm
**Description:** As a developer, I want example 03 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new NativeSTT(), new WebLLMLLM({...}), new NativeTTS()]`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-019: Update example 04-custom-tts
**Description:** As a developer, I want example 04 updated to use multi-role or explicit output provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] If custom TTS does not cover output role, add `new BrowserAudioOutput()` and import it
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-020: Update example 05-deepgram-audio
**Description:** As a developer, I want example 05 updated with explicit MicrophoneInput and BrowserAudioOutput.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new MicrophoneInput(), new DeepgramSTT({...}), ..., new BrowserAudioOutput()]`
- [ ] Import `MicrophoneInput` and `BrowserAudioOutput` from `composite-voice`
- [ ] Remove any `managedAudio` references and old `audio.input`/`audio.output` config
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-021: Update example 06-custom-ui
**Description:** As a developer, I want example 06 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-022: Update example 07-conversation-history
**Description:** As a developer, I want example 07 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-023: Update example 08-eager-llm
**Description:** As a developer, I want example 08 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-024: Update example 09-turn-taking
**Description:** As a developer, I want example 09 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-025: Update example 10-proxy-server
**Description:** As a developer, I want example 10 updated with both client config and proxy adapter usage.

**Acceptance Criteria:**
- [ ] Update client-side `CompositeVoice` constructor to use `providers: [...]` array
- [ ] For Deepgram providers, use `[new MicrophoneInput(), new DeepgramSTT({...}), ..., new BrowserAudioOutput()]`
- [ ] Update proxy adapter usage if it references old config shape
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-026: Update example 11-deepgram-tts
**Description:** As a developer, I want example 11 updated with explicit output provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array with `new BrowserAudioOutput()` for output
- [ ] Import `BrowserAudioOutput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-027: Update example 12-deepgram-stt
**Description:** As a developer, I want example 12 updated with explicit input provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array with `new MicrophoneInput()` for input
- [ ] Import `MicrophoneInput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-028: Update example 13-deepgram-stt-tts
**Description:** As a developer, I want example 13 as a full 5-provider example.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new MicrophoneInput(), new DeepgramSTT({...}), ..., new DeepgramTTS({...}), new BrowserAudioOutput()]`
- [ ] Import `MicrophoneInput` and `BrowserAudioOutput`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-029: Update example 14-assemblyai-stt
**Description:** As a developer, I want example 14 updated with explicit input provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array with `new MicrophoneInput()` for input
- [ ] Import `MicrophoneInput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-030: Update example 15-elevenlabs-tts
**Description:** As a developer, I want example 15 updated with explicit output provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array with `new BrowserAudioOutput()` for output
- [ ] Import `BrowserAudioOutput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-031: Update example 16-openai-tts
**Description:** As a developer, I want example 16 updated with explicit output provider.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array with `new BrowserAudioOutput()` for output
- [ ] Import `BrowserAudioOutput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-032: Update example 17-deepgram-stt-openai-tts
**Description:** As a developer, I want example 17 updated as a mixed-providers 5-provider array.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new MicrophoneInput(), new DeepgramSTT({...}), ..., new OpenAITTS({...}), new BrowserAudioOutput()]`
- [ ] Import `MicrophoneInput` and `BrowserAudioOutput`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-033: Update example 18-native-stt-deepgram-tts
**Description:** As a developer, I want example 18 updated showing multi-role input+stt with separate output.

**Acceptance Criteria:**
- [ ] Update constructor to `providers: [new NativeSTT(), ..., new DeepgramTTS({...}), new BrowserAudioOutput()]`
- [ ] NativeSTT covers input+stt roles; BrowserAudioOutput covers output
- [ ] Import `BrowserAudioOutput` from `composite-voice`
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-034: Update example 19-custom-stt
**Description:** As a developer, I want example 19 updated showing custom provider with `roles` property.

**Acceptance Criteria:**
- [ ] Update custom STT provider class to include `roles: ['stt']` property
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-035: Update example 20-custom-llm
**Description:** As a developer, I want example 20 updated showing custom provider with `roles` property.

**Acceptance Criteria:**
- [ ] Update custom LLM provider class to include `roles: ['llm']` property
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-036: Update example 21-custom-tts
**Description:** As a developer, I want example 21 updated showing custom provider with `roles` property.

**Acceptance Criteria:**
- [ ] Update custom TTS provider class to include `roles: ['tts']` property
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-037: Update example 22-function-calling
**Description:** As a developer, I want example 22 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-038: Update example 23-tools
**Description:** As a developer, I want example 23 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-039: Update example 24-multi-model
**Description:** As a developer, I want example 24 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-040: Update example 25-events
**Description:** As a developer, I want example 25 updated to showcase queue events alongside existing events.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Add listener examples for `queue.overflow` and `queue.stats` events
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-041: Update example 26-error-handling
**Description:** As a developer, I want example 26 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-042: Update example 27-streaming
**Description:** As a developer, I want example 27 updated to the array-based provider config.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-043: Update example 28-advanced-config
**Description:** As a developer, I want example 28 updated to showcase the full new config shape including queue options.

**Acceptance Criteria:**
- [ ] Update constructor to use `providers: [...]` array
- [ ] Add `queue: { input: { maxSize: 2000 }, output: { maxSize: 500 } }` config example
- [ ] Demonstrate both 3-provider (multi-role) and 5-provider (explicit) patterns
- [ ] Remove any `managedAudio` references
- [ ] Update any README/comments
- [ ] `pnpm build` succeeds in the example directory

### US-044: Update README.md
**Description:** As a developer, I want the project README updated to reflect the new 5-role pipeline architecture.

**Acceptance Criteria:**
- [ ] Replace "Quick Start" config example with array-based provider config
- [ ] Add "5-Role Pipeline" architecture section with ASCII diagram
- [ ] Add "Provider Roles" section explaining the 5 roles and multi-role concept
- [ ] Add config examples: 3-provider (multi-role), 5-provider (explicit), server-side (BufferInput + NullOutput)
- [ ] Add "Server-Side Usage" section showing Node.js/Bun/Deno with `BufferInput`/`NullOutput`
- [ ] Add "Custom Providers" section for `AudioInputProvider` and `AudioOutputProvider`
- [ ] Update all code snippets to use `providers: [...]`
- [ ] Remove any references to `managedAudio`
- [ ] All markdown links resolve correctly

### US-045: Update CHANGELOG.md
**Description:** As a developer, I want the CHANGELOG updated with this release's changes.

**Acceptance Criteria:**
- [ ] Add entry using conventional commit style
- [ ] Added section: new types, new providers, new config format, queue system, format detection, queue events
- [ ] Changed section: orchestrator refactored to 5-role pipeline, config format is now array-based
- [ ] Removed section: `managedAudio`, `ProviderConfig` with `{ stt, llm, tts }`, `AudioConfig.input`/`AudioConfig.output`
- [ ] Fixed section: race condition where first audio frames were lost during STT WebSocket handshake

### US-046: Update CONTRIBUTING.md
**Description:** As a contributor, I want the contributing guide updated to explain the `roles` property and the 5-role system.

**Acceptance Criteria:**
- [ ] Update "Adding a Provider" section to explain the `roles` property
- [ ] Document that new providers must declare their roles
- [ ] Add guidance on implementing `AudioInputProvider` and `AudioOutputProvider`
- [ ] Update any code examples to use the new config format

### US-047: Update AGENTS.md
**Description:** As an AI agent, I want AGENTS.md updated to reflect the 5-role pipeline architecture.

**Acceptance Criteria:**
- [ ] Update any architecture descriptions to reference the 5-role pipeline
- [ ] Update any code references to use the new config format
- [ ] Ensure the file accurately describes the current codebase structure

## Functional Requirements

- FR-1: The `resolveProviders()` function must map any valid combination of providers to a `ResolvedPipeline`, auto-filling NativeSTT (input+stt) and NativeTTS (tts+output) as defaults when those roles are uncovered. Only `llm` is strictly required.
- FR-2: When `input !== stt` (separate providers), an `AudioBufferQueue` must exist between them to prevent audio loss during STT connection
- FR-3: When `tts !== output` (separate providers), an `AudioBufferQueue` must exist between them
- FR-4: Multi-role providers (e.g., NativeSTT covering `input`+`stt`) must use a simplified path without queues
- FR-5: The `AudioBufferQueue` must buffer chunks while the consumer is not connected and flush them in order when `startDraining()` is called
- FR-6: Audio format detection must identify WAV, OGG, MP3, AAC, WebM, FLAC, AIFF, and MP4 from the first 12 bytes
- FR-7: The `AudioHeaderCache` must cache the container header and provide it for re-injection after WebSocket reconnection
- FR-8: `BufferInput` and `NullOutput` must have zero browser dependencies for server-side usage
- FR-9: The `configureSTTFromMetadata()` function must auto-fill STT encoding/sampleRate/channels from input metadata without overwriting user-set values
- FR-10: All 28 examples must build and use the new `providers: [...]` config format
- FR-11: Queue overflow must emit a `queue.overflow` event with the count of dropped chunks
- FR-12: `getQueueStats()` must return size, totalEnqueued, totalDequeued, and oldestChunkAge for both queues

## Non-Goals (Out of Scope)

- Custom audio processing nodes (effects, gain, filters) within the pipeline
- Audio recording/export to file (beyond what providers do internally)
- Automatic provider discovery or lazy loading
- Breaking changes to the server-side proxy adapters (Express, Next.js, Node)
- Changes to existing WebSocket reconnection logic in `WebSocketManager`
- Backward-compatible `{ stt, llm, tts }` config format (clean break only)
- Runtime provider hot-swapping after initialization
- Audio resampling within the queue (that remains in `AudioCapture`)

## Technical Considerations

- `AudioCapture` and `AudioPlayer` classes are NOT deleted - they are wrapped by `MicrophoneInput` and `BrowserAudioOutput` respectively
- Existing utilities (`floatTo16BitPCM`, `downsampleAudio`, `createWavHeader`, `getAudioMimeType`, `WebSocketManager`) remain unchanged
- The `AllInOneProvider` interface in `providers.ts` (if it exists) should be evaluated for compatibility with the roles system
- Pre-commit hooks run `pnpm install --frozen-lockfile` then `pnpm test` - any changes to `package.json` must include lockfile updates
- The `magic-frame-detection.md` reference file in the project root should be removed after its content is implemented in `src/utils/audioFormat.ts`

## Dependency Graph

```
US-001 (types)
+-- US-002 (AudioBufferQueue)
+-- US-003 (format detection + header cache)
+-- US-004 (MicrophoneInput)
+-- US-005 (BrowserAudioOutput)
+-- US-006 (BufferInput + NullOutput)
+-- US-007 (resolution) <- also depends on US-004, US-005, US-009
+-- US-008 (metadata auto-config)
+-- US-009 (NativeSTT/TTS multi-role)
+-- US-011 (config types)
         |
         +-- US-010 (orchestrator) <- depends on US-002, US-003, US-007, US-008, US-011
                |
                +-- US-012 (exports)
                +-- US-013 (queue events)
                +-- US-014 (race condition tests)
                +-- US-015 (multi-role tests)
                     |
                     +-- US-016 through US-043 (examples) <- depend on US-010, US-012
                     |
                     +-- US-044 (README) <- depends on US-010, US-012, examples
                     +-- US-045 (CHANGELOG) <- depends on US-010, US-012, examples
                     +-- US-046 (CONTRIBUTING) <- depends on US-010, US-012
                     +-- US-047 (AGENTS.md) <- depends on US-010, US-012
```

## Success Metrics

- All existing tests pass after the refactor
- New unit tests cover AudioBufferQueue, format detection, header cache, provider resolution, and metadata auto-config
- Integration tests prove: no audio frames lost during STT connection, multi-role resolution works, array config validates correctly
- All 28 examples build successfully with `pnpm build`
- `pnpm tsc --noEmit` passes with the new config shape
- Zero runtime regressions when running example 01 (NativeSTT), example 05 (DeepgramSTT), and example 10 (proxy server)

## Open Questions

- Should `AudioBufferQueue` support a `'block'` overflow strategy (backpressure), or is `drop-oldest`/`drop-newest` sufficient for v1?
- Should the `AllInOneProvider` interface (if present) be adapted to the roles system or deprecated?
- Should `detectAudioFormat` be async to support larger sniff buffers in the future?
- What version number should be used for `@since` tags in TSDoc?
