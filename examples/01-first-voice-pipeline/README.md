# Example 01 — First Voice Pipeline

The simplest possible voice pipeline using browser-native speech recognition and synthesis with Claude as the LLM.

No extra API keys beyond Anthropic. NativeSTT (Web Speech API) handles speech-to-text, AnthropicLLM sends text to Claude, and NativeTTS (SpeechSynthesis API) speaks the response aloud.

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/01-first-voice-pipeline/sample.env examples/01-first-voice-pipeline/.env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/cv-example-01-first-voice-pipeline dev
```

Open [http://localhost:3001](http://localhost:3001) in Chrome or Edge.

## How it works

1. Click **Initialize** to connect providers and grant microphone access
2. Click **Start Listening** to begin speech recognition
3. Speak naturally — your words appear in the Transcript panel
4. Claude responds in the Response panel and speaks aloud via the browser
5. Click **Stop** when done
