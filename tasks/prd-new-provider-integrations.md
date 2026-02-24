# PRD: New Provider Integrations (Phase 1 + 2)

## Overview

Expand composite-voice's provider ecosystem with 6 new providers across two phases, enabling developers to mix and match best-in-class STT, LLM, and TTS services. Phase 1 adds Groq (LLM), AssemblyAI (STT), and ElevenLabs (TTS). Phase 2 adds Cartesia (TTS), Google Gemini (LLM), and Mistral (LLM). A shared `OpenAICompatibleLLM` base class underpins all OpenAI-format LLM providers, making it trivial to add future providers (DeepSeek, Perplexity, etc.).

Each provider includes: a provider class, proxy route support, a Vite example app (Deepgram-prioritized stacks), and E2E tests (render + round-trip).

## Goals

- Add 6 new providers: GroqLLM, AssemblyAISTT, ElevenLabsTTS, CartesiaTTS, GeminiLLM, MistralLLM
- Create `OpenAICompatibleLLM` base class covering any OpenAI-format API (Groq, Mistral, Gemini, DeepSeek, etc.)
- Add proxy routes for all new providers (server-side API key injection)
- Create 6 new example apps showcasing each provider in a Deepgram-heavy stack
- Add render + round-trip E2E tests for every new example
- Maintain the SDK's extensible, event-driven architecture

## Quality Gates

These commands must pass for every user story:
- `pnpm test` — runs full test suite (unit + E2E)

## User Stories

### US-001: Create OpenAICompatibleLLM base class
### US-002: Implement GroqLLM provider class
### US-003: Add Groq proxy route
### US-004: Create example 60-groq-pipeline
### US-005: Add E2E tests for example 60-groq-pipeline
### US-006: Implement AssemblyAISTT provider class
### US-007: Add AssemblyAI proxy route
### US-008: Create example 70-assemblyai-pipeline
### US-009: Add E2E tests for example 70-assemblyai-pipeline
### US-010: Implement ElevenLabsTTS provider class
### US-011: Add ElevenLabs proxy route
### US-012: Create example 80-elevenlabs-pipeline
### US-013: Add E2E tests for example 80-elevenlabs-pipeline
### US-014: Implement CartesiaTTS provider class
### US-015: Add Cartesia proxy route
### US-016: Create example 90-cartesia-pipeline
### US-017: Add E2E tests for example 90-cartesia-pipeline
### US-018: Implement GeminiLLM provider class
### US-019: Add Gemini proxy route
### US-020: Create example 100-gemini-pipeline
### US-021: Add E2E tests for example 100-gemini-pipeline
### US-022: Implement MistralLLM provider class
### US-023: Add Mistral proxy route
### US-024: Create example 110-mistral-pipeline
### US-025: Add E2E tests for example 110-mistral-pipeline
