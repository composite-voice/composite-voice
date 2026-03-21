# Changelog

## [0.0.5](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.0.4...composite-voice-v0.0.5) (2026-03-21)


### Features

* accept string | string[] for all array query params ([f82df35](https://github.com/lukeocodes/composite-voice/commit/f82df3510d4a72ad8b2c772c513c9d529ce47612))
* dual visual/spoken chunks with markdown stripping for TTS ([1ee1565](https://github.com/lukeocodes/composite-voice/commit/1ee15659f3cb6301abab4abd09e2ef45a019ff8a))
* multi-round tool use loop (up to 5 rounds) ([e3d8e37](https://github.com/lukeocodes/composite-voice/commit/e3d8e37a24fa4d4fae06876f0946579436edc7bd))
* skip code fences in TTS output ([d788fb2](https://github.com/lukeocodes/composite-voice/commit/d788fb2bb222ae3e5f251db8c2ac53f68444fd06))


### Bug Fixes

* buffer code fences entirely — never send to TTS or stream to UI ([1c8aa58](https://github.com/lukeocodes/composite-voice/commit/1c8aa58d083732ba5bfa25afc87cb8dcb011d043))
* make AudioWorkletProcessor declare abstract to fix TypeDoc build ([b68494d](https://github.com/lukeocodes/composite-voice/commit/b68494db3edc1f618613ea97e7b8cebb1183ee1d))
* resolve all lint errors and warnings across codebase ([a379422](https://github.com/lukeocodes/composite-voice/commit/a379422472f02576c66858e7730c198c091bf6c2))
* resolve CI example compile failures ([6d0c519](https://github.com/lukeocodes/composite-voice/commit/6d0c5197fa032df0c932307e1c0a7004ad274ddb))
* restore manifest to 0.0.4 so release-please computes correct diff ([ac3802a](https://github.com/lukeocodes/composite-voice/commit/ac3802a967f8971432c0318a630ee2257e9a6748))


### Reverts

* remove manual CHANGELOG entries — release-please manages this ([130c2d2](https://github.com/lukeocodes/composite-voice/commit/130c2d2ad75b833aa4233db87df90eec19633cbf))


### Documentation

* add smart text routing, update zero-dependency messaging across all docs ([769ac10](https://github.com/lukeocodes/composite-voice/commit/769ac10159b2b205198d472d9c9d597174c84149))


### Miscellaneous Chores

* release 0.0.5 ([1f73639](https://github.com/lukeocodes/composite-voice/commit/1f736396401ae396dd85f075a3b80b612daebeef))

## [0.0.4](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.0.3...composite-voice-v0.0.4) (2026-03-16)


### ⚠ BREAKING CHANGES

* rebuild all examples with React + design system

### Features

* rebuild all examples with React + design system ([57794aa](https://github.com/lukeocodes/composite-voice/commit/57794aad3b0e24f757230134e6b4f76916066be6))
* **stt:** implement DeepgramFlux V2 with native WebSocket, strict role validation ([dee6e6a](https://github.com/lukeocodes/composite-voice/commit/dee6e6ab693391bbb70c79887ac4041a5f8e77f7))


### Bug Fixes

* **examples:** Deepgram pipeline for 63, generateFromMessages for 64, Select options for 65 ([a06bf3a](https://github.com/lukeocodes/composite-voice/commit/a06bf3aa73e99b35b642f99726391a53e1b329fa))
* **examples:** standardize all examples with tailwind, styles, and no-markdown prompts ([722753f](https://github.com/lukeocodes/composite-voice/commit/722753f7019cb97f26d220bcad57d8b7915d3c26))
* **examples:** update example 03 with 5-role pipeline and deps ([1188e4c](https://github.com/lukeocodes/composite-voice/commit/1188e4cb20c519bcd5d7854f4497058e85127e02))
* **examples:** update example 04 with tailwind deps and no-markdown prompt ([68d03b7](https://github.com/lukeocodes/composite-voice/commit/68d03b74d39f096808278499b3c7a9c162f0a5da))
* **examples:** use CodeBlock code prop instead of children, fix interval leak ([bac3918](https://github.com/lukeocodes/composite-voice/commit/bac3918c460e58caec7135fcf1b486326869dba1))
* **examples:** use public getHistory() API in example 06 ([a89e8a2](https://github.com/lukeocodes/composite-voice/commit/a89e8a2ea274c8047c253d47ee35e7357c59c390))
* **examples:** use state variable for agent prop, update example 14 for live Flux ([bc868c5](https://github.com/lukeocodes/composite-voice/commit/bc868c5095bf2d80b4cbaba4e9b5d233fe6ee3cd))
* NativeSTT mic cycling, browser capability checks, I/O context frontmatter ([19b8a17](https://github.com/lukeocodes/composite-voice/commit/19b8a175527672ef802d148d38753c3cc8ddb826))
* **proxy:** WS race condition, CORS headers, content-encoding ([7712e1e](https://github.com/lukeocodes/composite-voice/commit/7712e1e5c549a761d52d1872796ff5f5708ad394))
* **turn-taking:** pause capture when NativeTTS bypasses echo cancellation ([8c4f206](https://github.com/lukeocodes/composite-voice/commit/8c4f206466fc65d90e8eb3a2206aa441705464d8))


### Miscellaneous Chores

* release 0.0.4 ([1fa025a](https://github.com/lukeocodes/composite-voice/commit/1fa025a7b0002586a5e2b4bf881f5cc047d2d84b))

## [0.0.3](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.0.2...composite-voice-v0.0.3) (2026-03-15)


### Bug Fixes

* **ci:** add registry-url for npm OIDC trusted publishing ([19abfa7](https://github.com/lukeocodes/composite-voice/commit/19abfa75b3281e391b548997af0b187c12f4cb35))


### Miscellaneous Chores

* release 0.0.3 ([e0446ca](https://github.com/lukeocodes/composite-voice/commit/e0446ca3f1541480b8595800eb78619b170a8ee1))

## [0.0.2](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.0.1...composite-voice-v0.0.2) (2026-03-15)


### ⚠ BREAKING CHANGES

* SDK architecture revamp — event-driven providers, unified auth, full docs sync ([#66](https://github.com/lukeocodes/composite-voice/issues/66))

### Features

* add barge-in support with generation tracking ([cbae4af](https://github.com/lukeocodes/composite-voice/commit/cbae4af82d157303d5b59b0547de23658f7c974f))
* add brand identity system, site infrastructure, and docs restructure ([9a47b63](https://github.com/lukeocodes/composite-voice/commit/9a47b6349edaf9b53510106ee94f484752840d8d))
* add full brand asset pipeline with manifest and OG wordmark ([ef45771](https://github.com/lukeocodes/composite-voice/commit/ef4577113de60a1d4aa1fb9ffd06d401dbfc55f3))
* add tool use support for LLM providers ([8de2f75](https://github.com/lukeocodes/composite-voice/commit/8de2f75075b6095bfec8d73c110b2b31ff61915b))
* add utteranceComplete flag, auto-connect TTS, and batch audio playback ([da2224b](https://github.com/lukeocodes/composite-voice/commit/da2224b7baae15fd1417874f43bece46d8556b7b))
* **deepgram:** migrate to SDK V5 and add similarity-based eager pipeline ([57251b5](https://github.com/lukeocodes/composite-voice/commit/57251b5a7f76c4c835105f2354bbab89833f70e9))
* ralph-tui-5mp.1 - US-001: Define core types and roles ([141d37f](https://github.com/lukeocodes/composite-voice/commit/141d37f9071aacb9d0115ea75bd7a564b8953561))
* ralph-tui-5mp.10 - US-010: Update CompositeVoice orchestrator ([c02a59c](https://github.com/lukeocodes/composite-voice/commit/c02a59c5ad225ec392d671ddc8fe18630654a6b0))
* ralph-tui-5mp.11 - US-011: Update CompositeVoiceConfig type ([946c9ce](https://github.com/lukeocodes/composite-voice/commit/946c9ce5f4ad342a8dde8a2dca25cd7e437aaf19))
* ralph-tui-5mp.12 - US-012: Update public exports ([b5a3bca](https://github.com/lukeocodes/composite-voice/commit/b5a3bcae4554abfa89a4ed070d5d51907cf42b9d))
* ralph-tui-5mp.13 - US-013: Add queue event types ([79f1365](https://github.com/lukeocodes/composite-voice/commit/79f1365f38bf9b630601e4e7f883ead1622a37fe))
* ralph-tui-5mp.14 - US-014: Integration tests - race condition fix ([50a0dd0](https://github.com/lukeocodes/composite-voice/commit/50a0dd0f2ba6af2cb7301ca1075fee51d85dfc5b))
* ralph-tui-5mp.15 - US-015: Integration tests - multi-role and array config ([8729b01](https://github.com/lukeocodes/composite-voice/commit/8729b01d8b756aa551a2550d094930bdd886e262))
* ralph-tui-5mp.16 - US-016: Update example 01-native-speech ([a05af18](https://github.com/lukeocodes/composite-voice/commit/a05af18ad0c5f0f615ebcfdb83ac247ace89ca2f))
* ralph-tui-5mp.17 - US-017: Update example 02-openai-llm ([d4dba5e](https://github.com/lukeocodes/composite-voice/commit/d4dba5ebd00175345f5f107c19085a8c6303b92b))
* ralph-tui-5mp.18 - US-018: Update example 03-webllm ([99b32e7](https://github.com/lukeocodes/composite-voice/commit/99b32e75804867863297479722f1e349f7514037))
* ralph-tui-5mp.19 - US-019: Update example 04-custom-tts ([a0cfd79](https://github.com/lukeocodes/composite-voice/commit/a0cfd79077c292f5bb917d0eb368d5322399f088))
* ralph-tui-5mp.2 - US-002: Implement AudioBufferQueue ([92c1944](https://github.com/lukeocodes/composite-voice/commit/92c1944708c9601b38bd27e0690392b3db6e8b5a))
* ralph-tui-5mp.20 - US-020: Update example 05-deepgram-audio ([e972e70](https://github.com/lukeocodes/composite-voice/commit/e972e70231f3a7beccd6f66808dbb62c7447b911))
* ralph-tui-5mp.21 - US-021: Update example 06-custom-ui ([ee6fa44](https://github.com/lukeocodes/composite-voice/commit/ee6fa44009428813726de49b722bc29a5112a525))
* ralph-tui-5mp.22 - US-022: Update example 07-conversation-history ([8c5d06a](https://github.com/lukeocodes/composite-voice/commit/8c5d06a6d21eb30307aea1122b22a4cdbee83576))
* ralph-tui-5mp.23 - US-023: Update example 08-eager-llm ([6b3dd08](https://github.com/lukeocodes/composite-voice/commit/6b3dd08670e9e7fd470eabd1765c74c834d0e2b1))
* ralph-tui-5mp.24 - US-024: Update example 09-turn-taking ([57bafb1](https://github.com/lukeocodes/composite-voice/commit/57bafb1f508159d01200bbab890565190b0b0551))
* ralph-tui-5mp.25 - US-025: Update example 10-proxy-server ([2fa6afb](https://github.com/lukeocodes/composite-voice/commit/2fa6afbdf1590ffa4fb5a0a2b429c931ccaea5f8))
* ralph-tui-5mp.26 - US-026: Update example 11-deepgram-tts ([86e2fe7](https://github.com/lukeocodes/composite-voice/commit/86e2fe75e963e8701f630c0f32096b6e1b89c0cf))
* ralph-tui-5mp.27 - US-027: Update example 12-deepgram-stt ([4308781](https://github.com/lukeocodes/composite-voice/commit/4308781969551b8946b7f20f676a2651953c2b80))
* ralph-tui-5mp.28 - US-028: Update example 13-deepgram-stt-tts ([fd22ca2](https://github.com/lukeocodes/composite-voice/commit/fd22ca28766163176fa17decf36a1f791126ee90))
* ralph-tui-5mp.29 - US-029: Update example 14-assemblyai-stt ([d6475ec](https://github.com/lukeocodes/composite-voice/commit/d6475ec39dd75d607d1444ac7214b1261f1ff9ea))
* ralph-tui-5mp.3 - US-003: Implement format detection and header cache ([8092b48](https://github.com/lukeocodes/composite-voice/commit/8092b486b8ddfdc09a5ce7400e19db017d3d5dfa))
* ralph-tui-5mp.30 - US-030: Update example 15-elevenlabs-tts ([7f11242](https://github.com/lukeocodes/composite-voice/commit/7f1124233b885c75adbbf78def8f7a6f6620a582))
* ralph-tui-5mp.32 - US-032: Update example 17-deepgram-stt-openai-tts ([e1016b1](https://github.com/lukeocodes/composite-voice/commit/e1016b147f7216ac4cb770ea46ed6c1d8ba4dc6d))
* ralph-tui-5mp.33 - US-033: Update example 18-native-stt-deepgram-tts ([9f63d55](https://github.com/lukeocodes/composite-voice/commit/9f63d5537d0f402d5e20d3bfd2010da70dab7fc6))
* ralph-tui-5mp.34 - US-034: Update example 19-custom-stt ([7746d76](https://github.com/lukeocodes/composite-voice/commit/7746d76a2420f237d9151c194dad7bd7fdd11437))
* ralph-tui-5mp.4 - US-004: Implement MicrophoneInput provider ([6308ba6](https://github.com/lukeocodes/composite-voice/commit/6308ba661fc5a850e1817cec4e9cae829380aa3a))
* ralph-tui-5mp.40 - US-040: Update example 25-events ([3097520](https://github.com/lukeocodes/composite-voice/commit/30975201430d79b51a4c71b9e8d6163afa56ad66))
* ralph-tui-5mp.41 - US-041: Update example 26-error-handling ([526ff91](https://github.com/lukeocodes/composite-voice/commit/526ff91802f4f01bbfb377b8992be264399fbfa6))
* ralph-tui-5mp.42 - US-042: Update example 27-streaming ([18a5172](https://github.com/lukeocodes/composite-voice/commit/18a5172ad1de08c780265697cbed58408b51abcd))
* ralph-tui-5mp.43 - US-043: Update example 28-advanced-config ([708c476](https://github.com/lukeocodes/composite-voice/commit/708c476b4c4ed7cdb3a53b32468f8858e6360943))
* ralph-tui-5mp.44 - US-044: Update README.md ([b42a0c7](https://github.com/lukeocodes/composite-voice/commit/b42a0c7659be371fd2ae7813bf5a47ffe56c1896))
* ralph-tui-5mp.45 - US-045: Update CHANGELOG.md ([88361af](https://github.com/lukeocodes/composite-voice/commit/88361af421e6d332a884a2a15262af6ba450d039))
* ralph-tui-5mp.46 - US-046: Update CONTRIBUTING.md ([a207f01](https://github.com/lukeocodes/composite-voice/commit/a207f01be4068ed3078f5c06b93365d606510b7c))
* ralph-tui-5mp.47 - US-047: Update AGENTS.md ([477930b](https://github.com/lukeocodes/composite-voice/commit/477930b15c6dc3e8a5dde3f52e435c6050c46114))
* ralph-tui-5mp.5 - US-005: Implement BrowserAudioOutput provider ([86a55b7](https://github.com/lukeocodes/composite-voice/commit/86a55b7536bc49e59da79e1d3a6e8bdbb21127f1))
* ralph-tui-5mp.6 - US-006: Implement BufferInput and NullOutput ([12ad6e1](https://github.com/lukeocodes/composite-voice/commit/12ad6e1dd9b9dbbea4f9719e90239a4547c31418))
* ralph-tui-5mp.7 - US-007: Implement provider resolution algorithm ([cab3bee](https://github.com/lukeocodes/composite-voice/commit/cab3bee63fddd53dbd512a87572ed3f3eae6f4c0))
* ralph-tui-5mp.8 - US-008: Implement STT metadata auto-configuration ([0ea29d8](https://github.com/lukeocodes/composite-voice/commit/0ea29d8400e76fcd15b03b8e35f8a51aaf05a072))
* ralph-tui-5mp.9 - US-009: Adapt NativeSTT and NativeTTS to multi-role ([678a727](https://github.com/lukeocodes/composite-voice/commit/678a7278058736150f6968d3d4a1d38b48638967))
* ralph-tui-za5.2 - US-002: Implement ElevenLabsSTT provider core ([840c9bf](https://github.com/lukeocodes/composite-voice/commit/840c9bf9f2a01d5b61b31a678cec35d800985090))
* ralph-tui-za5.3 - US-003: Implement authentication — API key, proxy, and token ([9e58844](https://github.com/lukeocodes/composite-voice/commit/9e588442e59d42e41eabb92d2a9e69ee9ec53784))
* ralph-tui-za5.4 - US-004: Implement transcription message handling ([c43fa56](https://github.com/lukeocodes/composite-voice/commit/c43fa56a67d3601531b4c4501a95bfb81c15ab98))
* ralph-tui-za5.5 - US-005: Implement commit strategy support ([7ee0e19](https://github.com/lukeocodes/composite-voice/commit/7ee0e1954d22bc556b4389562705677874f3fe59))
* ralph-tui-za5.6 - US-006: Implement language code auto-detection and mapping ([4587f1e](https://github.com/lukeocodes/composite-voice/commit/4587f1e5abbfc3773687dd4b97a9843f1bc91baf))
* ralph-tui-za5.7 - US-007: Add proxy routing for ElevenLabs STT ([2582f6e](https://github.com/lukeocodes/composite-voice/commit/2582f6e4ecf58c424803f40ddab1ad567f2a6ed0))
* ralph-tui-za5.8 - US-008: Write unit tests for ElevenLabsSTT ([2f98f56](https://github.com/lukeocodes/composite-voice/commit/2f98f56a1a6a0da44976f0a667a66b4dd0ae8fb4))
* ralph-tui-za5.9 - US-009: Create ElevenLabsSTT example app ([106ce28](https://github.com/lukeocodes/composite-voice/commit/106ce289119a10a26de9f2225a180cb454891716))
* SDK architecture revamp — event-driven providers, unified auth, full docs sync ([#66](https://github.com/lukeocodes/composite-voice/issues/66)) ([148f393](https://github.com/lukeocodes/composite-voice/commit/148f393d90fed447b5cd9b785b6a6e464c2a9088))
* **ui:** add adaptive iconmark with rounded background for favicon ([4e3711e](https://github.com/lukeocodes/composite-voice/commit/4e3711efdf7d426d8393d9bde27e4ecf879812df))
* **ui:** add adaptive wordmark SVG via satori ([07c7e74](https://github.com/lukeocodes/composite-voice/commit/07c7e74808b1645815ffcdaec261caaf52e07af1))
* **ui:** extract VersionPill component and style breadcrumbs ([6ac294d](https://github.com/lukeocodes/composite-voice/commit/6ac294de6457bf8222f8cb54ac220a88c405acc1))
* **ui:** generate lettermark SVG from Inter Bold via satori ([7356658](https://github.com/lukeocodes/composite-voice/commit/7356658937978a292384ad8fbc451d09627a1957))


### Bug Fixes

* **ci:** remove registry-url from npm OIDC publish step ([8e4c87d](https://github.com/lukeocodes/composite-voice/commit/8e4c87d160a5650665008603383bf561bad0b12f))
* **docs:** correct Deepgram V1/V2 model info and feature attribution ([1ed1e01](https://github.com/lukeocodes/composite-voice/commit/1ed1e01c91246817908063794c6aa90f80b3fab1))
* **native-stt:** auto-restart recognition on unexpected end, document browser limits ([1ea6091](https://github.com/lukeocodes/composite-voice/commit/1ea6091c22a67bb21c335ea06266232ee5e02eb4))


### Documentation

* add advanced feature docs, provider matrix, and dynamic examples page ([c75e64a](https://github.com/lukeocodes/composite-voice/commit/c75e64ac6b17879b24225cf35e41408543d68e4c))
* add comprehensive documentation with provider guides and collapsible nav ([f2a0992](https://github.com/lukeocodes/composite-voice/commit/f2a0992b96a8e3d1f7e5f517fd3fa29ff93fff8a))
* add ElevenLabsSTT guide and update provider references ([426b64a](https://github.com/lukeocodes/composite-voice/commit/426b64aef8bd3ec5b6166aa6c33f80bc3bc830af))
* add FAQ and troubleshooting reference page ([1e40dce](https://github.com/lukeocodes/composite-voice/commit/1e40dce0aea199fd20f4da86ed09d9d2a1f0a050))
* prioritize Deepgram in production stacks and add provider cross-links ([08c82b0](https://github.com/lukeocodes/composite-voice/commit/08c82b07983cab185beb75612f54b0dcbd370e9a))
* refine eager pipeline timing diagrams ([794c81b](https://github.com/lukeocodes/composite-voice/commit/794c81bf282c160ff64cb179bedee01513bf1c9d))
* update examples and guides for DeepgramFlux, fix SDK option naming ([012b3c1](https://github.com/lukeocodes/composite-voice/commit/012b3c1b1f92b42a9ab10653c9d478c0d627bd55))


### Miscellaneous Chores

* release 0.0.2 ([9cdf26e](https://github.com/lukeocodes/composite-voice/commit/9cdf26e2a9f8a0574a3df92cf15880c1bccca15a))

## [Unreleased]

### ⚠ BREAKING CHANGES

* **core:** Redesigned SDK to use a 5-role pipeline architecture (`input`, `stt`, `llm`, `tts`, `output`). The `CompositeVoice` config now uses `providers: BaseProvider[]` array instead of `{ stt, llm, tts }` object. Audio I/O is promoted to first-class provider roles, enabling server-side (Node/Bun/Deno) usage and fixing a race condition where first audio frames were lost during STT WebSocket handshake.
    - `ProviderConfig` interface with `{ stt, llm, tts }` shape removed
    - `AudioConfig` interface and `audio` property removed from `CompositeVoiceConfig`
    - `managedAudio` property removed from `BaseProvider` (replaced by `roles` array)

### Features

* **types:** add `ProviderRole`, `AudioInputProvider`, `AudioOutputProvider`, and `ResolvedPipeline` types for the 5-role pipeline
* **types:** add `readonly roles: readonly ProviderRole[]` property to `BaseProvider` interface
* **types:** add `AudioBufferQueueConfig` and `queue` config option to `CompositeVoiceConfig`
* **providers:** add `MicrophoneInput` provider wrapping `AudioCapture` as first-class `input` role
* **providers:** add `BrowserAudioOutput` provider wrapping `AudioPlayer` as first-class `output` role
* **providers:** add `BufferInput` and `NullOutput` providers for server-side pipelines (zero browser dependencies)
* **pipeline:** add `AudioBufferQueue` bounded FIFO queue with `drop-oldest`, `drop-newest`, and `block` overflow strategies
* **pipeline:** add `AudioHeaderCache` for audio format detection and header caching on WebSocket reconnection
* **pipeline:** add `resolveProviders()` function mapping flat provider array to `ResolvedPipeline` with auto-fill defaults
* **pipeline:** add `configureSTTFromMetadata()` for auto-configuring STT encoding/sampleRate/channels from input metadata
* **utils:** add `detectAudioFormat()` magic-byte format detection (WAV, OGG, MP3, AAC, WebM, FLAC, AIFF, MP4) and `extractHeader()` for format-specific header extraction
* **events:** add `QueueOverflowEvent` (`queue.overflow`) and `QueueStatsEvent` (`queue.stats`) event types for pipeline health monitoring
* **core:** add `getQueueStats()` public method on `CompositeVoice` for observing both queue states
* **providers:** `NativeSTT` now implements `AudioInputProvider` (multi-role: `['input', 'stt']`)
* **providers:** `NativeTTS` now implements `AudioOutputProvider` (multi-role: `['tts', 'output']`)

### Bug Fixes

* **core:** fix race condition where first audio frames were lost during STT WebSocket handshake — `AudioBufferQueue` now buffers audio while STT connects, then flushes in order when ready

### Code Refactoring

* **core:** refactor `CompositeVoice` orchestrator to use `ResolvedPipeline`, `AudioBufferQueue`, and `AudioHeaderCache` for the 5-role pipeline
* **config:** replace `ProviderConfig { stt, llm, tts }` with `providers: BaseProvider[]` array-based config
* **config:** remove `AudioConfig` interface — input/output configuration is now a provider constructor concern
* **providers:** replace `managedAudio` property with `roles` array on all base provider classes
* **examples:** update all examples to use `providers: [...]` array-based config format

## [0.0.1](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.0.1...composite-voice-v0.0.1) (2026-02-25)


### ⚠ BREAKING CHANGES

* **core:** Major architectural shift in responsibility boundaries: Providers now own audio I/O:
    - STT providers manage microphone capture (mic → STT)
    - TTS providers manage speaker playback (TTS → speakers)
    - SDK removed AudioCapture and AudioPlayer from main flow
    - Removed stopSpeaking() - providers control their own playback
    CompositeVoice changes:
    - Use 4 state machines (agent orchestrator + 3 sub-machines)
    - State derived from capture + playback + processing states
    - Pause/resume capture during TTS to prevent echo
    - Handle state transitions through state machines
    - Remove getAudioCapture() and getAudioPlayer() methods
    Benefits:
    - Clear responsibility boundaries (SDK coordinates, providers do I/O)
    - Better encapsulation and modularity
    - Easier to implement custom providers
    - State management more granular and observable
* **state:** Replaced single AgentState class with new state machine architecture:
    - Added AgentStateMachine as orchestrator (derives high-level state)
    - Added SimpleAudioCaptureStateMachine (manages capture lifecycle)
    - Added SimpleAudioPlaybackStateMachine (manages playback lifecycle)
    - Added SimpleProcessingStateMachine (manages LLM processing)
    - Removed AgentState.ts in favor of distributed state management
    Benefits:
    - Clear separation of concerns
    - Each state machine manages its own domain
    - Agent state derived from sub-machine states
    - Better observability and testability

### Features

* add AnthropicLLM provider and architectural improvements ([6c5fcb5](https://github.com/lukeocodes/composite-voice/commit/6c5fcb5cd714d4c9896f72ea089b1e8071cf7e85))
* add conversation history, fix dispose/stopSpeaking, add example README ([852c80e](https://github.com/lukeocodes/composite-voice/commit/852c80ee6cd3e8d01be48d9a3bb6ad9ab82c2c46))
* add example projects ([7f45dbd](https://github.com/lukeocodes/composite-voice/commit/7f45dbd5a3655442d95d5858134a7f2a3de7f555))
* add NativeSTT timeout, AudioCapture dispose, and expand test coverage ([afb234a](https://github.com/lukeocodes/composite-voice/commit/afb234a0aa5666581e5bf95ff4a1bb526db11aeb))
* **apps:** scaffold web, docs, and design workspace apps ([54beebe](https://github.com/lukeocodes/composite-voice/commit/54beebef60aeb1f0f66342deb47940f5c0e7e1f4))
* composite-voice-d7x.1 - US-001: Create OpenAICompatibleLLM base class ([9a6eb75](https://github.com/lukeocodes/composite-voice/commit/9a6eb75c97849075bad3a4e0cb86c7b684dfc7e3))
* composite-voice-d7x.10 - US-010: Implement ElevenLabsTTS provider class ([c3fb7cb](https://github.com/lukeocodes/composite-voice/commit/c3fb7cb9fdd31fd2499b3c080288900ca27b3765))
* composite-voice-d7x.11 - US-011: Add ElevenLabs proxy route ([c0332ea](https://github.com/lukeocodes/composite-voice/commit/c0332ea751002acf302807d13fb52a2fa4fce189))
* composite-voice-d7x.12 - US-012: Create example 80-elevenlabs-pipeline ([64e6225](https://github.com/lukeocodes/composite-voice/commit/64e622571d3bbf04d512f2658af084d547f4eb39))
* composite-voice-d7x.13 - US-013: Add E2E tests for example 80-elevenlabs-pipeline ([da4013b](https://github.com/lukeocodes/composite-voice/commit/da4013bbb569521d16e2532beca9f0bbb587405d))
* composite-voice-d7x.14 - US-014: Implement CartesiaTTS provider class ([3307411](https://github.com/lukeocodes/composite-voice/commit/330741166ff6376836c3ae3510f354eae536f9f4))
* composite-voice-d7x.15 - US-015: Add Cartesia proxy route ([e7a93cc](https://github.com/lukeocodes/composite-voice/commit/e7a93cc6c5bd04a3df2bf7d6578da2e592ebfb83))
* composite-voice-d7x.16 - US-016: Create example 90-cartesia-pipeline ([530ece3](https://github.com/lukeocodes/composite-voice/commit/530ece375bbd29cb1924af1d3f6ad83700431f63))
* composite-voice-d7x.17 - US-017: Add E2E tests for example 90-cartesia-pipeline ([fa44889](https://github.com/lukeocodes/composite-voice/commit/fa44889a33d2e228d8b134b6ff2e067f57fc0460))
* composite-voice-d7x.18 - US-018: Implement GeminiLLM provider class ([8bda8db](https://github.com/lukeocodes/composite-voice/commit/8bda8db17712de76041a78da1068a1f1b9b9ba59))
* composite-voice-d7x.19 - US-019: Add Gemini proxy route ([3532e99](https://github.com/lukeocodes/composite-voice/commit/3532e9932d2a4e0368c15490d57c08c5e0394b37))
* composite-voice-d7x.2 - US-002: Implement GroqLLM provider class ([e8ddf94](https://github.com/lukeocodes/composite-voice/commit/e8ddf94043942c968766a1679af2355c1b1afde1))
* composite-voice-d7x.20 - US-020: Create example 100-gemini-pipeline ([ab80c0f](https://github.com/lukeocodes/composite-voice/commit/ab80c0feb00e003f287a5adfd65b1547a61ffbd1))
* composite-voice-d7x.21 - US-021: Add E2E tests for example 100-gemini-pipeline ([38fbf32](https://github.com/lukeocodes/composite-voice/commit/38fbf32d29bf47e4bf9526158493f0b93106df33))
* composite-voice-d7x.22 - US-022: Implement MistralLLM provider class ([5913fbf](https://github.com/lukeocodes/composite-voice/commit/5913fbf44e210c85471683611e11891f51c7427c))
* composite-voice-d7x.23 - US-023: Add Mistral proxy route ([dd320a7](https://github.com/lukeocodes/composite-voice/commit/dd320a7d9a899698f1af0738889ef518859c495f))
* composite-voice-d7x.24 - US-024: Create example 110-mistral-pipeline ([25e372a](https://github.com/lukeocodes/composite-voice/commit/25e372afb063ed35c9b27e39cb107c1357c2ffa0))
* composite-voice-d7x.25 - US-025: Add E2E tests for example 110-mistral-pipeline ([875c3d2](https://github.com/lukeocodes/composite-voice/commit/875c3d2f16dc2cee8e317cc0017f8836fb9e71c8))
* composite-voice-d7x.3 - US-003: Add Groq proxy route ([920a759](https://github.com/lukeocodes/composite-voice/commit/920a759dd615ffb2653f296bbd85d54bd361f9ce))
* composite-voice-d7x.4 - US-004: Create example 60-groq-pipeline ([86d8134](https://github.com/lukeocodes/composite-voice/commit/86d81349088b9ce5f795d5be8b0a4961b39a800e))
* composite-voice-d7x.5 - US-005: Add E2E tests for example 60-groq-pipeline ([8b130b7](https://github.com/lukeocodes/composite-voice/commit/8b130b734dea9fe536b566eff9c2325eba97b706))
* composite-voice-d7x.6 - US-006: Implement AssemblyAISTT provider class ([19117c3](https://github.com/lukeocodes/composite-voice/commit/19117c35b07eb565088e603cdeb5e7972adc12fb))
* composite-voice-d7x.7 - US-007: Add AssemblyAI proxy route ([5f3d08c](https://github.com/lukeocodes/composite-voice/commit/5f3d08c60aedb191f2dcbda8140e9f9c5a1943c7))
* composite-voice-d7x.8 - US-008: Create example 70-assemblyai-pipeline ([0284e12](https://github.com/lukeocodes/composite-voice/commit/0284e124e130b400f43a44f9d5facdf27a2a60e4))
* composite-voice-d7x.9 - US-009: Add E2E tests for example 70-assemblyai-pipeline ([036e26f](https://github.com/lukeocodes/composite-voice/commit/036e26fc2112fc24836ed015ca8385aedf42791c))
* composite-voice-ekb.1 - US-000: Set up shared test infrastructure and audio fixture ([66fecb0](https://github.com/lukeocodes/composite-voice/commit/66fecb0b112a49b8f4c757f52ed69cdd0b50ceca))
* composite-voice-ekb.10 - US-009: E2E test 12-custom-provider (port 3012) ([d672786](https://github.com/lukeocodes/composite-voice/commit/d672786cf70219dbfbdfbdd6ef98188b0db01f05))
* composite-voice-ekb.11 - US-010: E2E test 13-multi-language (port 3013) ([59c7ec5](https://github.com/lukeocodes/composite-voice/commit/59c7ec557afba9217e55a4b9696712f3b9e6f7e4))
* composite-voice-ekb.12 - US-011: E2E test 20-deepgram-pipeline (port 3020) ([6dca9c8](https://github.com/lukeocodes/composite-voice/commit/6dca9c82b2b17a54ac8256eafeb5bc0cc64fd48a))
* composite-voice-ekb.13 - US-012: E2E test 21-eager-pipeline (port 3021) ([0d3069b](https://github.com/lukeocodes/composite-voice/commit/0d3069bc6ff3a986456a540146901e63fef72851))
* composite-voice-ekb.14 - US-013: E2E test 22-deepgram-options (port 3022) ([aafb2d9](https://github.com/lukeocodes/composite-voice/commit/aafb2d96100d8b6bd29906643cb19d6141c7d1b4))
* composite-voice-ekb.15 - US-014: E2E test 23-deepgram-voices (port 3023) ([762fd1e](https://github.com/lukeocodes/composite-voice/commit/762fd1e67053b9db87686149a92f178459245fe7))
* composite-voice-ekb.16 - US-015: E2E test 24-deepgram-conversation-history (port 3024) ([2c55f8e](https://github.com/lukeocodes/composite-voice/commit/2c55f8ed1602c772c0779d19b7fa05126bd87d89))
* composite-voice-ekb.17 - US-016: E2E test 30-anthropic-models (port 3030) ([ebf36e5](https://github.com/lukeocodes/composite-voice/commit/ebf36e523f6dbb2b0fa111de3b015c9ad26408ab))
* composite-voice-ekb.18 - US-017: E2E test 31-anthropic-streaming-config (port 3031) ([59536e3](https://github.com/lukeocodes/composite-voice/commit/59536e35bf97319776400d630aaaf695771dcc20))
* composite-voice-ekb.19 - US-018: E2E test 40-openai-pipeline (port 3040) ([8839694](https://github.com/lukeocodes/composite-voice/commit/8839694558b237e29c9f86e8ad44b37cfd1bc127))
* composite-voice-ekb.2 - US-001: E2E test 00-minimal-voice-agent (port 3000) ([72ab0d0](https://github.com/lukeocodes/composite-voice/commit/72ab0d002cd636e13be1a69c134acc128c675e2d))
* composite-voice-ekb.20 - US-019: E2E test 41-openai-deepgram (port 3041) ([ed73d6b](https://github.com/lukeocodes/composite-voice/commit/ed73d6b74f1c1604043bd2fb7068ae77c80af2dc))
* composite-voice-ekb.21 - US-020: E2E test 42-openai-tts-pipeline (port 3042) ([09e46d7](https://github.com/lukeocodes/composite-voice/commit/09e46d70e2fcd0325083d24550642ca1a41ddea4))
* composite-voice-ekb.22 - US-021: Final review and summary issue ([0933e8d](https://github.com/lukeocodes/composite-voice/commit/0933e8d8b2c1af0c42e52315e84743db9cc710a8))
* composite-voice-ekb.3 - US-002: E2E test 01-conversation-history (port 3001) ([2a7dfef](https://github.com/lukeocodes/composite-voice/commit/2a7dfefb9af8700d420c86dc4cfaa56850fb30e9))
* composite-voice-ekb.4 - US-003: E2E test 02-system-persona (port 3002) ([f79c011](https://github.com/lukeocodes/composite-voice/commit/f79c0111e2a5d2208466fe0dc41fca861a7a162c))
* composite-voice-ekb.5 - US-004: E2E test 03-event-inspector (port 3003) ([11906d6](https://github.com/lukeocodes/composite-voice/commit/11906d6f0322b167d6045b4c3a1d8080a07db4e6))
* composite-voice-ekb.6 - US-005: E2E test 04-error-recovery (port 3004) ([dfbf21a](https://github.com/lukeocodes/composite-voice/commit/dfbf21ada44bb021811d6e121964f2c6f2baf6e0))
* composite-voice-ekb.7 - US-006: E2E test 05-turn-taking (port 3005) ([601cd05](https://github.com/lukeocodes/composite-voice/commit/601cd05beed63026983ef8fdd501ea703f8d0439))
* composite-voice-ekb.8 - US-007: E2E test 10-proxy-server (port 3010) ([03d05cc](https://github.com/lukeocodes/composite-voice/commit/03d05ccfebb0912ec78e9b4e72a4f9c96300c885))
* composite-voice-ekb.9 - US-008: E2E test 11-nextjs-proxy (port 3011) ([fffd190](https://github.com/lukeocodes/composite-voice/commit/fffd190dbfc434841cb6f1c5df6f92f04c4c0fe0))
* **config:** add turn-taking configuration and browser capability detection ([11f25a0](https://github.com/lukeocodes/composite-voice/commit/11f25a0a2119d9adb2b8b6d52be5ef5119fdbfe4))
* **design:** add cross-site navbar, footer, and unified preferences store ([8a4ea76](https://github.com/lukeocodes/composite-voice/commit/8a4ea76e4259053dc03ba65afe6e3efc98af8e1b))
* **design:** add UI component library and design system showcases ([f9521d4](https://github.com/lukeocodes/composite-voice/commit/f9521d4d19c63426f69c5c657d7a8d67e2bb79cc))
* **docs:** add cross-site navigation via Starlight Header override ([9a6736b](https://github.com/lukeocodes/composite-voice/commit/9a6736ba62da00095bb7002c9827f90ff8f3cb3f))
* **docs:** rewrite header and theme integration to match design system ([5653659](https://github.com/lukeocodes/composite-voice/commit/5653659a38e88f8b4436484cd2c0c50250bf7bf5))
* eager LLM pipeline, utterance accumulation, and new examples ([93747da](https://github.com/lukeocodes/composite-voice/commit/93747da8db7f1538cb887d39a5510f82c6bf6f7a))
* **examples:** expand to 19 examples across 5 provider categories ([16abdf0](https://github.com/lukeocodes/composite-voice/commit/16abdf0073f605d4a1b12cd522accd5d6ec3c4b6))
* **examples:** migrate examples 00-03 to Vite dev proxy ([77977b1](https://github.com/lukeocodes/composite-voice/commit/77977b18792bd0583c95f8b1b0eacabe469ab9b4))
* **examples:** setup basic-browser as Nx application ([20ed0e9](https://github.com/lukeocodes/composite-voice/commit/20ed0e94de14b52a076727a4d0233141ae6e3a70))
* **examples:** upgrade basic-browser to use OpenAI LLM ([118a689](https://github.com/lukeocodes/composite-voice/commit/118a68936a286f66d9017bb2f9da898d859db515))
* **examples:** use Vite environment variables for API keys ([7d9f9ca](https://github.com/lukeocodes/composite-voice/commit/7d9f9ca4453d3163a77b5ee5ee698313b8f5b950))
* fix Live TTS state management and add AnthropicLLM tests ([d1f3dad](https://github.com/lukeocodes/composite-voice/commit/d1f3dadb46e6c0deb2cca80e6aa6d14274f50a30))
* implement CompositeVoice core library ([83661fa](https://github.com/lukeocodes/composite-voice/commit/83661fa27375997c3e3a7f60700e801cd357a6ec))
* **llm:** add OpenAI LLM provider with streaming support ([6b1e608](https://github.com/lukeocodes/composite-voice/commit/6b1e6088c7f84ed2be7038f70392915da53fad5c))
* **providers:** add OpenAI TTS provider ([469d967](https://github.com/lukeocodes/composite-voice/commit/469d967a2410bf1466304ab7fb4b365af713412a))
* **providers:** add WebLLM as optional in-browser LLM provider ([97f5127](https://github.com/lukeocodes/composite-voice/commit/97f5127b132bbaffa2a43d568ee51199bfda1ed2))
* **proxy:** add server-side proxy middleware for CORS-blocked providers ([2fb3896](https://github.com/lukeocodes/composite-voice/commit/2fb389641d6f89d6d01e2f9f3ed380ee33896c05))
* setting up project tooling ([8a0c741](https://github.com/lukeocodes/composite-voice/commit/8a0c7413c0fbba47ad0cce65d9d484dfa50fc799))
* **stt:** add comprehensive debug logging to NativeSTT provider ([0b76cd2](https://github.com/lukeocodes/composite-voice/commit/0b76cd218248e4b4b32d1e12883e307cdf1febea))
* **stt:** add Deepgram STT provider with WebSocket streaming ([a8b6b41](https://github.com/lukeocodes/composite-voice/commit/a8b6b41cc6ce3b4b1e5fd415a2a4c88fe6ee5a80))
* **tts:** add Deepgram TTS provider with WebSocket streaming ([1c73040](https://github.com/lukeocodes/composite-voice/commit/1c730401b801301be830f9ab5af11c6820ddc284))
* **ui:** cross-site preference sync via URL param and cookie domain ([3f587fb](https://github.com/lukeocodes/composite-voice/commit/3f587fb508d838b62041cfa0cd1a888973edf71e))
* **ui:** sync preferences across sites via cookie fallback ([2cfbed2](https://github.com/lukeocodes/composite-voice/commit/2cfbed253065316643666ae8584b7ca4e3a8441b))
* **web:** add landing page with version pill and fix React key spread warnings ([bb95262](https://github.com/lukeocodes/composite-voice/commit/bb95262cac1efca499619be08599b1de582d5831))
* wire turnTaking config into CompositeVoice and add turnTaking tests ([0aeef45](https://github.com/lukeocodes/composite-voice/commit/0aeef45feabe8d2e24b3626b3e914bab2f4337da))


### Bug Fixes

* **ci:** split npm and GitHub Packages publish into parallel jobs ([725be49](https://github.com/lukeocodes/composite-voice/commit/725be49f3148c76d849bacd9cd1ebaa43c056c56))
* **ci:** update lockfile and add frozen-lockfile pre-commit check ([5adac27](https://github.com/lukeocodes/composite-voice/commit/5adac27e8725bde0c5872a5527202ed5364ca50b))
* **design:** use icon prop for IconButton showcase and restore primary token ([adc30ab](https://github.com/lukeocodes/composite-voice/commit/adc30ab3edfe5e9c74dfdaf38bfd6ca2a85f5f83))
* **design:** use literal Tailwind bg classes in color showcase ([c584bb0](https://github.com/lukeocodes/composite-voice/commit/c584bb0f1a137f16a319b72e8eaed55b67d63569))
* **docs:** remove remaining NX references from examples README ([00b74d1](https://github.com/lukeocodes/composite-voice/commit/00b74d1b014332ef58173de624d7dd7447cd1575))
* **lint:** resolve CI lint and format failures ([52046e7](https://github.com/lukeocodes/composite-voice/commit/52046e76d1d8de83abbdaaa9b546336b0c75f9f6))
* resolve all eslint warnings and errors ([c4119bf](https://github.com/lukeocodes/composite-voice/commit/c4119bf3a5649f54424c5eba5a3c1e9ab3bda4b8))
* **sdk:** emit agent.error events with context and recoverability ([78fc5d8](https://github.com/lukeocodes/composite-voice/commit/78fc5d86078cd5facbd00f1dcd94d42ad6d714ce))
* **ui:** improve contrast and mobile responsiveness across design system ([bcb9d9a](https://github.com/lukeocodes/composite-voice/commit/bcb9d9a0324e41043aa9d095ed833ef7913f3b8c))
* **ui:** improve dark mode text contrast with semantic foreground tokens ([1d4466c](https://github.com/lukeocodes/composite-voice/commit/1d4466c7c5efa20c7e490496be89d61e45519e16))
* update tests for managedAudio interface and new Deepgram defaults ([2b9c49e](https://github.com/lukeocodes/composite-voice/commit/2b9c49ec7866845827c2c5a03a07dc518ade4a8a))


### Documentation

* add comprehensive documentation ([0fec2f3](https://github.com/lukeocodes/composite-voice/commit/0fec2f3c96e7ed4d5af1b028ceb56b1752423451))
* add comprehensive provider documentation ([32c40c2](https://github.com/lukeocodes/composite-voice/commit/32c40c2c723e1d726dfda112bc8ae51ba0a45bf2))
* add main README with project overview ([4a3f381](https://github.com/lukeocodes/composite-voice/commit/4a3f381e4c573dfdefd82fa25a1d3a4d980259bf))
* add state transitions guide and streamline main docs README ([6198649](https://github.com/lukeocodes/composite-voice/commit/61986495de28f82d94aec321e2d23a048a4ce15e))
* comprehensive README, community files, and example READMEs overhaul ([ca65592](https://github.com/lukeocodes/composite-voice/commit/ca655923e3fd15771d3f1b714f81a47326479188))
* **examples:** comprehensive README overhaul for all five examples ([7e8b50b](https://github.com/lukeocodes/composite-voice/commit/7e8b50bec7f8e8b7161d561520a37ee5bf59a1b4))
* overhaul README, community files, and all example READMEs ([9fbb89f](https://github.com/lukeocodes/composite-voice/commit/9fbb89f0bd64c6c00d8a9c54c44fd775b9d64bf1))
* **readme:** update for new providers and examples ([d6c12dc](https://github.com/lukeocodes/composite-voice/commit/d6c12dc0b6683112f819e31940ccbfab562c11d2))
* **sdk:** add comprehensive TSDoc comments to all source files ([fc8ca0c](https://github.com/lukeocodes/composite-voice/commit/fc8ca0c8c799bacdf55f1e27c671d63ee338b885))
* update examples README and improve exports ([ccd4b84](https://github.com/lukeocodes/composite-voice/commit/ccd4b845c8ffcc6fa422b96c3e05dc421c8b674c))


### Miscellaneous Chores

* bootstrap release-please at 0.0.1 ([95c3afc](https://github.com/lukeocodes/composite-voice/commit/95c3afcd321bad9a25af36f93a278beb08c9a050))


### Code Refactoring

* **core:** delegate audio I/O to providers and use new state machines ([fc52689](https://github.com/lukeocodes/composite-voice/commit/fc52689d42661ab35ac146f9fc82f630a65df7c8))
* **state:** replace monolithic state machine with orchestrated architecture ([b2aa9a6](https://github.com/lukeocodes/composite-voice/commit/b2aa9a6bd71591f481cbe89c1b890dfbfee9fc25))

## [1.1.0](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v1.0.0...composite-voice-v1.1.0) (2026-02-24)


### Features

* composite-voice-ekb.1 - US-000: Set up shared test infrastructure and audio fixture ([66fecb0](https://github.com/lukeocodes/composite-voice/commit/66fecb0b112a49b8f4c757f52ed69cdd0b50ceca))
* composite-voice-ekb.10 - US-009: E2E test 12-custom-provider (port 3012) ([d672786](https://github.com/lukeocodes/composite-voice/commit/d672786cf70219dbfbdfbdd6ef98188b0db01f05))
* composite-voice-ekb.11 - US-010: E2E test 13-multi-language (port 3013) ([59c7ec5](https://github.com/lukeocodes/composite-voice/commit/59c7ec557afba9217e55a4b9696712f3b9e6f7e4))
* composite-voice-ekb.12 - US-011: E2E test 20-deepgram-pipeline (port 3020) ([6dca9c8](https://github.com/lukeocodes/composite-voice/commit/6dca9c82b2b17a54ac8256eafeb5bc0cc64fd48a))
* composite-voice-ekb.13 - US-012: E2E test 21-eager-pipeline (port 3021) ([0d3069b](https://github.com/lukeocodes/composite-voice/commit/0d3069bc6ff3a986456a540146901e63fef72851))
* composite-voice-ekb.14 - US-013: E2E test 22-deepgram-options (port 3022) ([aafb2d9](https://github.com/lukeocodes/composite-voice/commit/aafb2d96100d8b6bd29906643cb19d6141c7d1b4))
* composite-voice-ekb.15 - US-014: E2E test 23-deepgram-voices (port 3023) ([762fd1e](https://github.com/lukeocodes/composite-voice/commit/762fd1e67053b9db87686149a92f178459245fe7))
* composite-voice-ekb.16 - US-015: E2E test 24-deepgram-conversation-history (port 3024) ([2c55f8e](https://github.com/lukeocodes/composite-voice/commit/2c55f8ed1602c772c0779d19b7fa05126bd87d89))
* composite-voice-ekb.17 - US-016: E2E test 30-anthropic-models (port 3030) ([ebf36e5](https://github.com/lukeocodes/composite-voice/commit/ebf36e523f6dbb2b0fa111de3b015c9ad26408ab))
* composite-voice-ekb.18 - US-017: E2E test 31-anthropic-streaming-config (port 3031) ([59536e3](https://github.com/lukeocodes/composite-voice/commit/59536e35bf97319776400d630aaaf695771dcc20))
* composite-voice-ekb.19 - US-018: E2E test 40-openai-pipeline (port 3040) ([8839694](https://github.com/lukeocodes/composite-voice/commit/8839694558b237e29c9f86e8ad44b37cfd1bc127))
* composite-voice-ekb.2 - US-001: E2E test 00-minimal-voice-agent (port 3000) ([72ab0d0](https://github.com/lukeocodes/composite-voice/commit/72ab0d002cd636e13be1a69c134acc128c675e2d))
* composite-voice-ekb.20 - US-019: E2E test 41-openai-deepgram (port 3041) ([ed73d6b](https://github.com/lukeocodes/composite-voice/commit/ed73d6b74f1c1604043bd2fb7068ae77c80af2dc))
* composite-voice-ekb.21 - US-020: E2E test 42-openai-tts-pipeline (port 3042) ([09e46d7](https://github.com/lukeocodes/composite-voice/commit/09e46d70e2fcd0325083d24550642ca1a41ddea4))
* composite-voice-ekb.22 - US-021: Final review and summary issue ([0933e8d](https://github.com/lukeocodes/composite-voice/commit/0933e8d8b2c1af0c42e52315e84743db9cc710a8))
* composite-voice-ekb.3 - US-002: E2E test 01-conversation-history (port 3001) ([2a7dfef](https://github.com/lukeocodes/composite-voice/commit/2a7dfefb9af8700d420c86dc4cfaa56850fb30e9))
* composite-voice-ekb.4 - US-003: E2E test 02-system-persona (port 3002) ([f79c011](https://github.com/lukeocodes/composite-voice/commit/f79c0111e2a5d2208466fe0dc41fca861a7a162c))
* composite-voice-ekb.5 - US-004: E2E test 03-event-inspector (port 3003) ([11906d6](https://github.com/lukeocodes/composite-voice/commit/11906d6f0322b167d6045b4c3a1d8080a07db4e6))
* composite-voice-ekb.6 - US-005: E2E test 04-error-recovery (port 3004) ([dfbf21a](https://github.com/lukeocodes/composite-voice/commit/dfbf21ada44bb021811d6e121964f2c6f2baf6e0))
* composite-voice-ekb.7 - US-006: E2E test 05-turn-taking (port 3005) ([601cd05](https://github.com/lukeocodes/composite-voice/commit/601cd05beed63026983ef8fdd501ea703f8d0439))
* composite-voice-ekb.8 - US-007: E2E test 10-proxy-server (port 3010) ([03d05cc](https://github.com/lukeocodes/composite-voice/commit/03d05ccfebb0912ec78e9b4e72a4f9c96300c885))
* composite-voice-ekb.9 - US-008: E2E test 11-nextjs-proxy (port 3011) ([fffd190](https://github.com/lukeocodes/composite-voice/commit/fffd190dbfc434841cb6f1c5df6f92f04c4c0fe0))
* **examples:** expand to 19 examples across 5 provider categories ([16abdf0](https://github.com/lukeocodes/composite-voice/commit/16abdf0073f605d4a1b12cd522accd5d6ec3c4b6))
* **providers:** add OpenAI TTS provider ([469d967](https://github.com/lukeocodes/composite-voice/commit/469d967a2410bf1466304ab7fb4b365af713412a))
* **providers:** add WebLLM as optional in-browser LLM provider ([97f5127](https://github.com/lukeocodes/composite-voice/commit/97f5127b132bbaffa2a43d568ee51199bfda1ed2))


### Bug Fixes

* **ci:** update lockfile and add frozen-lockfile pre-commit check ([5adac27](https://github.com/lukeocodes/composite-voice/commit/5adac27e8725bde0c5872a5527202ed5364ca50b))

## [1.0.0](https://github.com/lukeocodes/composite-voice/compare/composite-voice-v0.1.0...composite-voice-v1.0.0) (2026-02-23)


### ⚠ BREAKING CHANGES

* **core:** Major architectural shift in responsibility boundaries: Providers now own audio I/O:
    - STT providers manage microphone capture (mic → STT)
    - TTS providers manage speaker playback (TTS → speakers)
    - SDK removed AudioCapture and AudioPlayer from main flow
    - Removed stopSpeaking() - providers control their own playback
    CompositeVoice changes:
    - Use 4 state machines (agent orchestrator + 3 sub-machines)
    - State derived from capture + playback + processing states
    - Pause/resume capture during TTS to prevent echo
    - Handle state transitions through state machines
    - Remove getAudioCapture() and getAudioPlayer() methods
    Benefits:
    - Clear responsibility boundaries (SDK coordinates, providers do I/O)
    - Better encapsulation and modularity
    - Easier to implement custom providers
    - State management more granular and observable
* **state:** Replaced single AgentState class with new state machine architecture:
    - Added AgentStateMachine as orchestrator (derives high-level state)
    - Added SimpleAudioCaptureStateMachine (manages capture lifecycle)
    - Added SimpleAudioPlaybackStateMachine (manages playback lifecycle)
    - Added SimpleProcessingStateMachine (manages LLM processing)
    - Removed AgentState.ts in favor of distributed state management
    Benefits:
    - Clear separation of concerns
    - Each state machine manages its own domain
    - Agent state derived from sub-machine states
    - Better observability and testability

### Features

* add AnthropicLLM provider and architectural improvements ([6c5fcb5](https://github.com/lukeocodes/composite-voice/commit/6c5fcb5cd714d4c9896f72ea089b1e8071cf7e85))
* add conversation history, fix dispose/stopSpeaking, add example README ([852c80e](https://github.com/lukeocodes/composite-voice/commit/852c80ee6cd3e8d01be48d9a3bb6ad9ab82c2c46))
* add example projects ([7f45dbd](https://github.com/lukeocodes/composite-voice/commit/7f45dbd5a3655442d95d5858134a7f2a3de7f555))
* add NativeSTT timeout, AudioCapture dispose, and expand test coverage ([afb234a](https://github.com/lukeocodes/composite-voice/commit/afb234a0aa5666581e5bf95ff4a1bb526db11aeb))
* **config:** add turn-taking configuration and browser capability detection ([11f25a0](https://github.com/lukeocodes/composite-voice/commit/11f25a0a2119d9adb2b8b6d52be5ef5119fdbfe4))
* eager LLM pipeline, utterance accumulation, and new examples ([93747da](https://github.com/lukeocodes/composite-voice/commit/93747da8db7f1538cb887d39a5510f82c6bf6f7a))
* **examples:** migrate examples 00-03 to Vite dev proxy ([77977b1](https://github.com/lukeocodes/composite-voice/commit/77977b18792bd0583c95f8b1b0eacabe469ab9b4))
* **examples:** setup basic-browser as Nx application ([20ed0e9](https://github.com/lukeocodes/composite-voice/commit/20ed0e94de14b52a076727a4d0233141ae6e3a70))
* **examples:** upgrade basic-browser to use OpenAI LLM ([118a689](https://github.com/lukeocodes/composite-voice/commit/118a68936a286f66d9017bb2f9da898d859db515))
* **examples:** use Vite environment variables for API keys ([7d9f9ca](https://github.com/lukeocodes/composite-voice/commit/7d9f9ca4453d3163a77b5ee5ee698313b8f5b950))
* fix Live TTS state management and add AnthropicLLM tests ([d1f3dad](https://github.com/lukeocodes/composite-voice/commit/d1f3dadb46e6c0deb2cca80e6aa6d14274f50a30))
* implement CompositeVoice core library ([83661fa](https://github.com/lukeocodes/composite-voice/commit/83661fa27375997c3e3a7f60700e801cd357a6ec))
* **llm:** add OpenAI LLM provider with streaming support ([6b1e608](https://github.com/lukeocodes/composite-voice/commit/6b1e6088c7f84ed2be7038f70392915da53fad5c))
* **proxy:** add server-side proxy middleware for CORS-blocked providers ([2fb3896](https://github.com/lukeocodes/composite-voice/commit/2fb389641d6f89d6d01e2f9f3ed380ee33896c05))
* setting up project tooling ([8a0c741](https://github.com/lukeocodes/composite-voice/commit/8a0c7413c0fbba47ad0cce65d9d484dfa50fc799))
* **stt:** add comprehensive debug logging to NativeSTT provider ([0b76cd2](https://github.com/lukeocodes/composite-voice/commit/0b76cd218248e4b4b32d1e12883e307cdf1febea))
* **stt:** add Deepgram STT provider with WebSocket streaming ([a8b6b41](https://github.com/lukeocodes/composite-voice/commit/a8b6b41cc6ce3b4b1e5fd415a2a4c88fe6ee5a80))
* **tts:** add Deepgram TTS provider with WebSocket streaming ([1c73040](https://github.com/lukeocodes/composite-voice/commit/1c730401b801301be830f9ab5af11c6820ddc284))
* wire turnTaking config into CompositeVoice and add turnTaking tests ([0aeef45](https://github.com/lukeocodes/composite-voice/commit/0aeef45feabe8d2e24b3626b3e914bab2f4337da))


### Bug Fixes

* **docs:** remove remaining NX references from examples README ([00b74d1](https://github.com/lukeocodes/composite-voice/commit/00b74d1b014332ef58173de624d7dd7447cd1575))
* **lint:** resolve CI lint and format failures ([52046e7](https://github.com/lukeocodes/composite-voice/commit/52046e76d1d8de83abbdaaa9b546336b0c75f9f6))
* resolve all eslint warnings and errors ([c4119bf](https://github.com/lukeocodes/composite-voice/commit/c4119bf3a5649f54424c5eba5a3c1e9ab3bda4b8))
* **sdk:** emit agent.error events with context and recoverability ([78fc5d8](https://github.com/lukeocodes/composite-voice/commit/78fc5d86078cd5facbd00f1dcd94d42ad6d714ce))
* update tests for managedAudio interface and new Deepgram defaults ([2b9c49e](https://github.com/lukeocodes/composite-voice/commit/2b9c49ec7866845827c2c5a03a07dc518ade4a8a))


### Documentation

* add comprehensive documentation ([0fec2f3](https://github.com/lukeocodes/composite-voice/commit/0fec2f3c96e7ed4d5af1b028ceb56b1752423451))
* add comprehensive provider documentation ([32c40c2](https://github.com/lukeocodes/composite-voice/commit/32c40c2c723e1d726dfda112bc8ae51ba0a45bf2))
* add main README with project overview ([4a3f381](https://github.com/lukeocodes/composite-voice/commit/4a3f381e4c573dfdefd82fa25a1d3a4d980259bf))
* add state transitions guide and streamline main docs README ([6198649](https://github.com/lukeocodes/composite-voice/commit/61986495de28f82d94aec321e2d23a048a4ce15e))
* comprehensive README, community files, and example READMEs overhaul ([ca65592](https://github.com/lukeocodes/composite-voice/commit/ca655923e3fd15771d3f1b714f81a47326479188))
* **examples:** comprehensive README overhaul for all five examples ([7e8b50b](https://github.com/lukeocodes/composite-voice/commit/7e8b50bec7f8e8b7161d561520a37ee5bf59a1b4))
* overhaul README, community files, and all example READMEs ([9fbb89f](https://github.com/lukeocodes/composite-voice/commit/9fbb89f0bd64c6c00d8a9c54c44fd775b9d64bf1))
* update examples README and improve exports ([ccd4b84](https://github.com/lukeocodes/composite-voice/commit/ccd4b845c8ffcc6fa422b96c3e05dc421c8b674c))


### Code Refactoring

* **core:** delegate audio I/O to providers and use new state machines ([fc52689](https://github.com/lukeocodes/composite-voice/commit/fc52689d42661ab35ac146f9fc82f630a65df7c8))
* **state:** replace monolithic state machine with orchestrated architecture ([b2aa9a6](https://github.com/lukeocodes/composite-voice/commit/b2aa9a6bd71591f481cbe89c1b890dfbfee9fc25))
