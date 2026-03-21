---
title: FAQ & Troubleshooting
description: Common issues, error codes, browser gotchas, and solutions for CompositeVoice.
order: 4
---

Quick answers for the most common issues developers hit when building with CompositeVoice.

---

## Setup & Installation

### "Cannot find module '@lukeocodes/composite-voice'"

The SDK must be built before examples or consuming apps can import it:

```bash
pnpm install && pnpm build
```

### "Missing API key" or 401 errors

1. Copy the example's `sample.env` to `.env` in the same directory.
2. Fill in the key — e.g., `ANTHROPIC_API_KEY=sk-ant-...`
3. **Never prefix keys with `VITE_`** — Vite auto-exposes `VITE_*` variables to the browser, leaking your key. The SDK proxy reads plain env vars server-side.

### Missing peer dependency errors

Most providers use native `fetch` and have no peer dependencies. The only providers that require an external package are:

| Provider | Peer dependency |
|---|---|
| [WebLLMLLM](/guides/llm/webllm) | `@mlc-ai/web-llm` (>=0.2.74) |

All other providers (AnthropicLLM, OpenAILLM, GroqLLM, GeminiLLM, MistralLLM, OpenAITTS, DeepgramSTT, DeepgramFlux, DeepgramTTS, AssemblyAISTT, ElevenLabsSTT, ElevenLabsTTS, CartesiaTTS, NativeSTT, NativeTTS) have no peer dependencies.

Install what you need:

```bash
npm install @mlc-ai/web-llm   # for WebLLM
```

---

## Browser & OS Compatibility

### NativeSTT does nothing / microphone dies silently

The Web Speech API in Chrome sends audio to **Google's speech recognition servers**. It will not work in:

| Browser | NativeSTT | NativeTTS | Why |
|---|---|---|---|
| Chrome / Edge | Works | Works | Full Google services |
| **Ungoogled Chromium** | **No** | Works | Google services stripped |
| **Brave** | **No** | Works | Google services stripped |
| Firefox | No | Limited | Web Speech API not implemented |
| Safari | Unreliable | Works | Partial, varies by version |

**Fix:** Switch to a WebSocket-based STT provider ([DeepgramSTT](/guides/stt/deepgram-stt), [AssemblyAISTT](/guides/stt/assemblyai-stt), or [ElevenLabsSTT](/guides/stt/elevenlabs-stt)) which work in all modern browsers.

### WebLLM won't load — "WebGPU not available"

[WebLLMLLM](/guides/llm/webllm) requires a WebGPU-capable browser. Check first:

```typescript
if (!navigator.gpu) {
  console.error('WebGPU not supported — use a cloud LLM provider instead');
}
```

Supported in Chrome 113+ and Edge 113+ only.

### Voice sounds different across operating systems

[NativeTTS](/guides/tts/native-tts) uses whatever voices the OS provides. Quality varies:

- **macOS:** Select **(Enhanced)** or **(Premium)** voices in System Settings > Accessibility > Spoken Content for better quality.
- **Windows:** Install additional voices via Settings > Time & Language > Speech.
- **Linux:** Voice quality depends on the speech-dispatcher configuration.

For consistent quality across platforms, use [DeepgramTTS](/guides/tts/deepgram-tts), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), or [CartesiaTTS](/guides/tts/cartesia-tts).

---

## Microphone & Audio

### Microphone permission denied

Browsers require a **user gesture** (click, tap) before granting microphone access. Make sure:

1. The user clicks a button before `startListening()` is called.
2. The page is served over `localhost` or `https://` — microphone access is blocked on plain `http://`.
3. The user hasn't previously denied permission. Click the lock icon in the address bar to reset.

If permission was denied, NativeSTT throws a `ProviderConnectionError`. Other STT providers (DeepgramSTT, etc.) rely on the SDK's internal `AudioCapture`, which throws a `MicrophonePermissionError`.

### No audio playback / speakers are silent

- Check the system volume isn't muted.
- Check the browser console for `AudioContext` suspension warnings — browsers suspend audio until a user gesture occurs.
- If using [DeepgramTTS](/guides/tts/deepgram-tts), verify the voice model is available on your plan. Try `aura-2-thalia-en` (available on free tier).

### Audio cuts out during TTS playback

By default, CompositeVoice pauses the microphone while TTS is playing to prevent echo. This is expected. After playback finishes, listening resumes automatically. See the [turn-taking guide](/advanced/turn-taking) to customize this behaviour.

---

## Network & Connectivity

### WebSocket connection fails

Common causes:

1. **Invalid API key** — check `.env` for typos, verify the key isn't revoked.
2. **Corporate VPN/firewall** — some networks block outbound WebSocket connections on port 443. Try on a different network.
3. **Proxy not running** — in development, the Vite proxy only works during `pnpm dev`. In production, ensure the Express/Node server is running.

### 404 on `/proxy/*` endpoints

- **Development:** The Vite dev server proxy only works with `pnpm dev`, not after a production build.
- **Production:** Ensure `server.ts` is running and `createExpressProxy` is mounted at the correct path.

### WebSocket timeout during long pauses

[DeepgramFlux](/guides/stt/deepgram-flux) uses Deepgram's V2 API which may disconnect after extended silence. Call `sendKeepAlive()` to maintain the connection:

```typescript
// Send keep-alive every 8 seconds during idle periods
setInterval(() => stt.sendKeepAlive(), 8000);
```

For other providers, adjust the `timeout` config (default: 10,000ms).

### WebSocket proxying in Next.js

Standard Vercel/Next.js deployments do not support WebSocket upgrade. If you need WebSocket proxying for DeepgramSTT/TTS, use a [custom Next.js server](/guides/proxy/nextjs) or deploy the proxy separately.

---

## Speech-to-Text Issues

### Transcripts cut off mid-sentence

Deepgram may split a single utterance into multiple `is_final` segments. The SDK buffers these until `speech_final` fires, but if the endpointing threshold is too aggressive, words get split.

**Fix:** Increase the endpointing window:

```typescript
new DeepgramSTT({
  options: {
    endpointing: 500,      // ms of silence before end-of-speech (default: 300)
    utteranceEndMs: 1500,   // ms before utterance boundary (default: 1000)
  },
});
```

### Eager pipeline not working — no preflight events

The eager LLM pipeline only works with [DeepgramFlux](/guides/stt/deepgram-flux). Check:

1. You're using `DeepgramFlux`, not `DeepgramSTT`.
2. `eagerEotThreshold` is set — without it, no `EagerEndOfTurn` events fire.
3. Your Deepgram account has V2 Flux model access.

```typescript
new DeepgramFlux({
  options: {
    model: 'flux-general-en',
    eagerEotThreshold: 0.5,  // enables preflight signals
    eotThreshold: 0.7,
  },
});
```

### Speech recognition stops mid-session (NativeSTT)

Chrome's Web Speech API sometimes fires `onend` even with `continuous: true`. The SDK auto-restarts recognition (up to 5 retries). If it keeps happening, check the browser console for errors, or switch to a WebSocket-based STT provider.

---

## Language Model Issues

### Anthropic: "`maxTokens` is required"

Unlike OpenAI, the Anthropic API requires `maxTokens` on every request. The SDK defaults to 1024, but for voice apps, shorter is better:

```typescript
new AnthropicLLM({
  proxyUrl: '/api/proxy/anthropic',
  model: 'claude-haiku-4-5',
  maxTokens: 256,  // keep voice responses concise
});
```

### LLM restarts too frequently (eager pipeline)

If the eager pipeline is cancelling and restarting the LLM on every small transcript change:

- Raise `similarityThreshold` (e.g., `0.9`) to tolerate minor word-level changes.
- Set `cancelOnTextChange: false` if small differences are acceptable.
- Speak with natural pauses — the eagerness threshold needs clear end-of-turn signals.

### Rate limiting (429 errors)

The SDK emits an `llm.error` event with the details. To handle:

1. Subscribe to `agent.on('llm.error', ...)` and surface a "please wait" message.
2. For Anthropic, check your [rate limits](https://console.anthropic.com/) — upgrade your plan or add retry logic.
3. Lower `maxTokens` to reduce token consumption per turn.

### WebLLM: first load is slow (100+ MB download)

The first load downloads model weights to the browser cache. Wire `onLoadProgress` to show a loading indicator:

```typescript
new WebLLMLLM({
  model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  onLoadProgress: (progress) => {
    loadingBar.style.width = `${(progress.progress * 100).toFixed(0)}%`;
  },
});
```

Subsequent loads use the cache and are near-instant.

---

## Text-to-Speech Issues

### OpenAI TTS: response is slow

[OpenAITTS](/guides/tts/openai-tts) is REST-based — the full audio must be generated before playback starts. For lower latency, switch to a streaming TTS provider: [DeepgramTTS](/guides/tts/deepgram-tts), [ElevenLabsTTS](/guides/tts/elevenlabs-tts), or [CartesiaTTS](/guides/tts/cartesia-tts).

### 4096-character limit (OpenAI TTS)

The OpenAI TTS API has a 4096-character request limit. The SDK handles this automatically, but if your LLM responses are long, consider reducing `maxTokens` or adding "keep responses brief" to your system prompt.

---

## Cost Optimization

### Conversation history makes costs grow

Every turn appends to the message history, so input tokens grow over time. Control this with `maxTurns`:

```typescript
new CompositeVoice({
  providers: [stt, llm, tts],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,  // keep last 10 exchanges, drop older ones
  },
});
```

Lower `maxTurns` means lower cost per turn but less context for the AI. Set `maxTurns: 0` for unlimited history (careful with long sessions).

### Choosing the right model for voice

Voice apps prioritize **latency** over capability. Recommended picks:

| Use case | LLM | Why |
|---|---|---|
| Lowest cost | [GroqLLM](/guides/llm/groq) (`llama-3.3-70b-versatile`) | Free tier, fastest inference |
| Best quality | [AnthropicLLM](/guides/llm/anthropic) (`claude-haiku-4-5`) | Fast, high quality, low cost |
| Full privacy | [WebLLMLLM](/guides/llm/webllm) | Runs entirely in the browser |

---

## Error Codes

All SDK errors extend `CompositeVoiceError` with a `code` and `recoverable` flag.

| Error Class | Code | Recoverable | Typical cause |
|---|---|---|---|
| `ProviderInitializationError` | `PROVIDER_INIT_ERROR` | No | Missing API key, missing peer dependency |
| `ProviderConnectionError` | `PROVIDER_CONNECTION_ERROR` | Yes | Network issue, service down |
| `ProviderResponseError` | `PROVIDER_RESPONSE_ERROR` | Yes | HTTP error (429 rate limit, 500 server error) |
| `AudioCaptureError` | `AUDIO_CAPTURE_ERROR` | Yes | Device disconnected, stream interrupted |
| `AudioPlaybackError` | `AUDIO_PLAYBACK_ERROR` | Yes | AudioContext failure, decoding error |
| `MicrophonePermissionError` | `MICROPHONE_PERMISSION_DENIED` | No | User denied microphone access |
| `ConfigurationError` | `CONFIGURATION_ERROR` | No | Invalid SDK configuration |
| `InvalidStateError` | `INVALID_STATE_ERROR` | No | Operation in wrong state (e.g., `startListening` before `initialize`) |
| `TimeoutError` | `TIMEOUT_ERROR` | Yes | WebSocket or API call exceeded time limit |
| `WebSocketError` | `WEBSOCKET_ERROR` | Yes | Connection drop, send failure |

**Recoverable** errors are transient — the SDK can retry automatically with `autoRecover: true`. **Non-recoverable** errors require user action (grant permission, fix config, add API key).

See [Error Recovery](/advanced/error-recovery) for detailed handling patterns.

---

## Production Checklist

Before deploying:

- [ ] All API keys in server-side env vars (not `VITE_` prefixed)
- [ ] Using `proxyUrl` on every provider (no `apiKey` in browser code)
- [ ] HTTPS enabled (required for microphone access)
- [ ] Rate limiting configured at the proxy level
- [ ] CORS restricted to your domain
- [ ] Spending limits set on provider dashboards
- [ ] Error events handled (`agent.error`, `llm.error`, `tts.error`, `transcription.error`)
- [ ] Logging enabled with appropriate level (`'info'` for production, `'debug'` for staging)
- [ ] `conversationHistory.maxTurns` set to control cost growth
- [ ] Tested in target browsers (especially if using NativeSTT/NativeTTS)

---

## Still stuck?

- Enable debug logging: `logging: { enabled: true, level: 'debug' }` — the SDK logs every state transition, WebSocket message, and provider call.
- Check the [Error Recovery guide](/advanced/error-recovery) for auto-recovery patterns.
- Browse the [examples](https://github.com/lukeocodes/composite-voice/tree/main/examples) — each one has a troubleshooting section in its README.
- Open an issue on [GitHub](https://github.com/lukeocodes/composite-voice/issues).
