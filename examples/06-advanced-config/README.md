# 06 — Advanced Config

Full configuration showcase demonstrating both pipeline patterns and all config options.

## What you'll learn

- **3-provider (multi-role)** — NativeSTT covers `input+stt`, NativeTTS covers `tts+output`
- **5-provider (explicit)** — MicrophoneInput, DeepgramSTT, DeepgramTTS, BrowserAudioOutput as separate providers
- **Queue buffering** — `AudioBufferQueue` between input→STT and TTS→output with configurable `maxSize`
- **Config options** — logging level, conversation history, turn-taking, auto-recovery

## Pipeline Presets

### Multi-role (3 providers)

```
NativeSTT ── AnthropicLLM ── NativeTTS
(input+stt)     (llm)       (tts+output)
```

No queues needed — multi-role providers handle audio I/O internally.

### Full Pipeline (5 providers)

```
MicrophoneInput ── InputQueue ── DeepgramSTT ── AnthropicLLM ── DeepgramTTS ── OutputQueue ── BrowserAudioOutput
   (input)        (max: 2000)      (stt)          (llm)           (tts)        (max: 500)       (output)
```

Queues buffer audio to prevent frame loss during STT WebSocket handshake.

## Providers

| Role   | Multi-role Preset | Full Pipeline Preset |
|--------|-------------------|----------------------|
| Input  | NativeSTT         | MicrophoneInput      |
| STT    | NativeSTT         | DeepgramSTT          |
| LLM    | AnthropicLLM      | AnthropicLLM         |
| TTS    | NativeTTS         | DeepgramTTS          |
| Output | NativeTTS         | BrowserAudioOutput   |

## Setup

```bash
cp sample.env .env
# Add your API keys to .env
pnpm dev
```

- **Multi-role preset** requires only `ANTHROPIC_API_KEY`
- **Full Pipeline preset** requires both `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY`

## Config Shape

```javascript
new CompositeVoice({
  providers: [...],                // 3 or 5 providers
  queue: {                         // only for 5-provider pattern
    input:  { maxSize: 2000 },
    output: { maxSize: 500 },
  },
  logging: { enabled: true, level: 'info' },
  conversationHistory: { enabled: true, maxTurns: 10 },
  turnTaking: { pauseCaptureOnPlayback: 'auto' },
  autoRecover: true,
})
```
