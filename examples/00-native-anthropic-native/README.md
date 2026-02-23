# Example 00 — Simplest Voice Agent

The absolute minimum to get a voice agent running: browser-native speech recognition, Anthropic for intelligence, and browser-native speech synthesis. **No Deepgram account needed** — just one API key.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API (Chrome/Edge built-in) | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API (browser built-in) | Free |

Start here. If this works for your use case, you're done. If you need better accuracy, cross-browser support, or lower latency, the later examples add those capabilities one at a time.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge — Web Speech API is not available in Firefox or Safari
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the sample env file
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
```

Edit `examples/00-native-anthropic-native/.env`:

```env
VITE_ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

---

## Run

```bash
pnpm example:00-native-anthropic-native:dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge.

---

## How it works

```
Microphone
    ↓
NativeSTT (Web Speech API)
    ↓  transcription.final
AnthropicLLM (claude-haiku-4-5)
    ↓  llm.chunk (streaming)
NativeTTS (SpeechSynthesis)
    ↓
Speakers
```

1. **Initialize** — creates the three providers and wires them together in a `CompositeVoice`
2. **Start Listening** — requests microphone access and opens the Web Speech recognition stream
3. **Speak** — interim results appear in italics as you talk; the final transcript shows when you pause
4. **LLM generation** — the transcript is sent to `claude-haiku-4-5`; the response streams back token by token
5. **TTS playback** — the browser reads the response aloud via `SpeechSynthesisUtterance`
6. **Loop** — the agent returns to listening automatically after playback ends
7. **Stop / Dispose** — pause listening, or tear everything down cleanly

`NativeSTT` and `NativeTTS` both set `managedAudio = true`, meaning they control their own audio pipelines directly through the browser APIs — the SDK's `AudioContext` layer is bypassed for these providers.

### Key code

```javascript
const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
  llm: new AnthropicLLM({
    apiKey: ANTHROPIC_API_KEY,
    model: 'claude-haiku-4-5',
    systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
    maxTokens: 200,
  }),
  tts: new NativeTTS({ rate: 1.0, preferLocal: true }),
});

await agent.initialize();
await agent.startListening();
```

---

## Configuration options

### NativeSTT

| Option | Default | Description |
|--------|---------|-------------|
| `language` | `'en-US'` | BCP-47 language tag |
| `continuous` | `true` | Keep recognising between pauses |
| `interimResults` | `true` | Emit partial transcripts while speaking |
| `startTimeout` | `5000` | ms to wait for first result before emitting an error |

### AnthropicLLM

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'claude-haiku-4-5'` | Any Anthropic model ID |
| `systemPrompt` | — | Sets the AI's persona and constraints |
| `maxTokens` | `200` | Maximum response length |
| `temperature` | `0.7` | Randomness (0 = deterministic, 1 = creative) |
| `stream` | `true` | Stream tokens as they arrive |

### NativeTTS

| Option | Default | Description |
|--------|---------|-------------|
| `rate` | `1.0` | Speech speed (0.1–10) |
| `pitch` | `1.0` | Voice pitch (0–2) |
| `volume` | `1.0` | Playback volume (0–1) |
| `preferLocal` | `true` | Prefer on-device voices over cloud voices |

---

## Troubleshooting

**"VITE_ANTHROPIC_API_KEY is not set"**

You haven't created the `.env` file yet:

```bash
cp examples/00-native-anthropic-native/sample.env examples/00-native-anthropic-native/.env
# Then add your key to the .env file
```

**"Cannot find module '@lukeocodes/composite-voice'"**

The SDK needs to be built first:

```bash
pnpm build
```

**"Microphone permission denied"**

Click the lock icon in the browser address bar and allow microphone access, then reload the page.

**Nothing happens when I speak**

- Confirm you're using Chrome or Edge — Firefox and Safari don't support the Web Speech API
- Check that your microphone is working in other applications
- Try speaking clearly in a quiet environment
- Click anywhere on the page first — browsers sometimes require a user gesture before activating speech recognition

**The AI's voice sounds robotic or reads punctuation aloud**

Try adjusting the `NativeTTS` options — a lower rate often sounds more natural:

```javascript
new NativeTTS({ rate: 0.9, pitch: 1.0, preferLocal: true })
```

On macOS, voices labelled `(Enhanced)` or `(Premium)` in System Settings → Accessibility → Spoken Content sound significantly better than the defaults.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[01 — Deepgram + Anthropic](../01-deepgram-anthropic-deepgram/)** | Real WebSocket STT and streaming TTS — better accuracy, cross-browser |
| **[02 — Conversation history](../02-conversation-history/)** | Multi-turn memory so the AI remembers earlier exchanges |
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Speculative LLM generation for lower perceived latency |
| **[04 — Server-side proxy](../04-proxy-server/)** | API keys server-side only — nothing in the browser bundle |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API support is limited and inconsistent |
