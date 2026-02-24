# Changelog

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
