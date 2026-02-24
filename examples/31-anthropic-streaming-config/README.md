# Example 31 — Anthropic Streaming Config

Response quality tuning with interactive sliders. Adjust temperature, max tokens, and top P in real time to see how streaming parameters affect Claude's responses.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How `temperature` controls response randomness (0 = deterministic, 1 = creative)
- How `maxTokens` limits response length in tokens
- How `topP` (nucleus sampling) narrows the token probability distribution
- How to reinitialize the agent with new LLM parameters at runtime
- The relationship between these parameters and voice agent response quality

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — the Web Speech API is not available in Firefox or Safari
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/31-anthropic-streaming-config/sample.env examples/31-anthropic-streaming-config/.env
```

Open `.env` and fill in your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:31-anthropic-streaming-config:dev
```

Open [http://localhost:3031](http://localhost:3031) in Chrome or Edge.

1. Adjust the sliders to set temperature, max tokens, and top P
2. Click **Initialize** — connects providers with the selected config
3. Click **Start** — the agent begins listening
4. Speak — Claude responds with the configured parameters
5. Adjust sliders and click **Apply & Reinitialize** to change parameters mid-session

---

## How it works

```
Sliders adjusted
    ↓
AnthropicLLM reconfigured  (temperature, maxTokens, topP)
    ↓
Agent disposed → reinitialized with new config
    ↓
Microphone → NativeSTT → AnthropicLLM → NativeTTS → Speakers
```

### Parameter guide

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| **Temperature** | 0.0 - 1.0 | 0.7 | Lower = more focused and deterministic; higher = more creative and varied |
| **Max Tokens** | 50 - 1000 | 200 | Limits the maximum response length — lower values produce shorter answers |
| **Top P** | 0.0 - 1.0 | 1.0 | Nucleus sampling — lower values restrict to more probable tokens |

### Example configurations

**Precise and concise** — factual answers with minimal variation:
```javascript
{ temperature: 0.1, maxTokens: 100, topP: 0.5 }
```

**Balanced** — good for general conversation:
```javascript
{ temperature: 0.7, maxTokens: 200, topP: 1.0 }
```

**Creative and verbose** — storytelling, brainstorming:
```javascript
{ temperature: 1.0, maxTokens: 500, topP: 1.0 }
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [30 — Anthropic Models](../30-anthropic-models/) | Compare Haiku, Sonnet, and Opus |
| [02 — System Persona](../02-system-persona/) | Combine config tuning with different personas |
| [01 — Conversation History](../01-conversation-history/) | Multi-turn memory with tuned parameters |
| [40 — OpenAI Pipeline](../40-openai-pipeline/) | Compare with OpenAI model parameters |
