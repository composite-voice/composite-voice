# Example 08 — Tool Use

Demonstrates LLM function calling with the `tools` config. Defines three simple tools (`get_weather`, `get_time`, `calculate`) and displays tool calls and results in the UI. After a tool executes, the LLM generates a natural-language follow-up.

| | Provider |
|-|----------|
| **STT** | NativeSTT (Web Speech API) |
| **LLM** | AnthropicLLM |
| **TTS** | NativeTTS (SpeechSynthesis) |

## Setup

```bash
cp examples/08-tool-use/sample.env .env
# Add your ANTHROPIC_API_KEY
pnpm example:08-tool-use:dev
```

Open [http://localhost:3008](http://localhost:3008) in Chrome or Edge.

## Try saying

- "What's the weather in San Francisco?"
- "What time is it in Tokyo?"
- "What is 42 times 17?"
