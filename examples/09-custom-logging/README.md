# Example 09 — Custom Logging

Demonstrates the SDK logging configuration with controls for log level and a custom logger function. SDK logs are displayed in a scrollable panel in the UI, color-coded by level.

| | Provider |
|-|----------|
| **STT** | NativeSTT (Web Speech API) |
| **LLM** | AnthropicLLM |
| **TTS** | NativeTTS (SpeechSynthesis) |

## Setup

```bash
cp examples/09-custom-logging/sample.env .env
# Add your ANTHROPIC_API_KEY
pnpm example:09-custom-logging:dev
```

Open [http://localhost:3009](http://localhost:3009) in Chrome or Edge.
