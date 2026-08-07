# Example 66 — Guardrails

Pluggable async filters between LLM output and TTS. Toggle PII redaction, pronunciation fixes, a blocklist, and a demo moderation classifier, then watch the `guardrail.*` events as the agent speaks.

|            | Provider             | Role                                                                      |
| ---------- | -------------------- | ------------------------------------------------------------------------- |
| **Input**  | `MicrophoneInput`    | Explicit audio input                                                      |
| **STT**    | `DeepgramSTT`        | WebSocket STT                                                             |
| **LLM**    | `AnthropicLLM`       | Claude via HTTP streaming                                                 |
| **TTS**    | `DeepgramTTS`        | WebSocket TTS — streaming, so the chunk-stage guardrail path is exercised |
| **Output** | `BrowserAudioOutput` | Web Audio playback                                                        |

## What you'll learn

- How `guardrails.filters` chains async filters between the LLM and TTS
- Why guardrails change only what is **spoken** — `llm.complete` still carries the raw model output
- The `'streaming'` vs `'buffered'` trade-off: low latency versus absolute blocking
- How `guardrail.applied`, `guardrail.blocked`, and `guardrail.error` surface every decision
- Ordering filters cheap-and-local first, network-bound last

## Try saying

| Prompt                                        | What the guardrail does                      |
| --------------------------------------------- | -------------------------------------------- |
| "What's your support email and phone number?" | PII redaction rewrites both before synthesis |
| "How do I run a SQL query with kubectl?"      | Pronunciation swaps in phonetic spellings    |
| "Tell me about Project Halcyon."              | Blocklist suppresses the utterance           |
| "Give me dangerous instructions."             | Demo moderation replaces the response        |

## Setup

```bash
pnpm install && pnpm build
cp examples/66-guardrails/sample.env examples/66-guardrails/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-66-guardrails dev
```

Open [http://localhost:3066](http://localhost:3066) in Chrome or Edge.
