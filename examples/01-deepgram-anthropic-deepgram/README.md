# Example 01 — Deepgram + Anthropic + Deepgram

Best-in-class voice agent using:

- **STT**: Deepgram nova-3 (real-time WebSocket transcription)
- **LLM**: Anthropic claude-haiku-4-6 (fastest Claude 4.6 model)
- **TTS**: Deepgram aura-2-thalia-en (streaming WebSocket synthesis at 24 kHz)

## Prerequisites

- Node.js 18+
- pnpm
- A [Deepgram API key](https://console.deepgram.com/)
- An [Anthropic API key](https://console.anthropic.com/)

## Setup

1. Install dependencies from the repo root:

```bash
pnpm install
```

2. Build the SDK (required before running the example):

```bash
pnpm build
```

3. Copy the sample env file and add your keys:

```bash
cp examples/01-deepgram-anthropic-deepgram/sample.env examples/01-deepgram-anthropic-deepgram/.env
```

Edit `.env`:

```env
VITE_DEEPGRAM_API_KEY=your-deepgram-api-key-here
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

## Running

From the repo root:

```bash
pnpm example:01-deepgram-anthropic-deepgram:dev
```

Then open [http://localhost:3001](http://localhost:3001) in Chrome or Edge.

## What it does

1. Click **Initialize** — connects SDK with all three providers
2. Click **Start Listening** — opens microphone and begins real-time transcription
3. Speak — Deepgram nova-3 streams transcript in real time
4. When you pause, the final transcript is sent to Anthropic claude-haiku-4-6
5. The LLM response streams back token by token
6. Deepgram aura-2 synthesizes the response and plays it through your speakers
7. Click **Stop Listening** to pause, or **Dispose** to tear everything down

## Architecture

```
Microphone → DeepgramSTT (nova-3, WS) → AnthropicLLM (haiku) → DeepgramTTS (aura-2, WS) → Speakers
```

All three providers use WebSocket connections for real-time, low-latency streaming.
The SDK orchestrates the turn-taking: capture is paused during TTS playback to prevent echo.

## Browser support

- Chrome / Edge: full support (recommended)
- Firefox: works, but Web Audio API behaviour may differ
- Safari: limited (no WebSocket-based AudioWorklet support)
