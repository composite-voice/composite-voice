# Example 81 — Vonage Phone Agent

A voice agent callers can talk to over a phone call on a [Vonage](https://developer.vonage.com/en/voice/voice-api/concepts/websockets) (formerly Nexmo) number. A plain `node:http` server serves the NCCO answer webhook, and a `ws` WebSocket server accepts the linear16 audio bridge Vonage opens to it — one CompositeVoice pipeline per call.

| Component | Details |
|-----------|---------|
| **Server** | `node:http` + `ws` on port 3081 |
| **Input/Output** | `VonageAudioSocket` (duplex, linear16 @ 16 kHz) |
| **STT** | `DeepgramSTT` — `nova-3`, linear16/16000 |
| **LLM** | `AnthropicLLM` — `claude-haiku-4-5` |
| **TTS** | `DeepgramTTS` — linear16/16000 (matches the NCCO rate) |

---

## What you'll learn

- How to return an NCCO `connect` action with a `websocket` endpoint (`content-type: audio/l16;rate=16000`) from `GET /answer`
- Why the NCCO rate, STT rate, and TTS rate must all agree
- How to hand each accepted WebSocket straight to the pipeline with `agent.startListening(socket)`
- The **one-pipeline-per-call** lifecycle: construct providers inside the connection handler, dispose when the socket closes
- How to log caller transcripts, agent replies, and DTMF keypresses server-side

---

## Prerequisites

- **Node.js 21+** (or 22 LTS) — the SDK's streaming STT/TTS providers use the global `WebSocket`
- **pnpm** and a build of the SDK (`pnpm install && pnpm build` at the repo root)
- A [Vonage API account](https://dashboard.nexmo.com) with a **Voice-enabled application** and a **linked phone number**
- A [Deepgram API key](https://console.deepgram.com) and an [Anthropic API key](https://console.anthropic.com)
- [ngrok](https://ngrok.com) (or any tunnel that gives you public `https://`/`wss://`)

---

## Setup

```bash
pnpm install && pnpm build   # from the repo root
cd examples/81-vonage-phone-agent
cp sample.env .env           # then fill in your keys
```

---

## Run

**1. Start the server**

```bash
pnpm dev
```

**2. Expose it with ngrok**

```bash
ngrok http 3081
```

Copy the forwarding domain, e.g. `https://abc123.ngrok-free.app`.

**3. Configure your Vonage application**

In the [Vonage dashboard](https://dashboard.nexmo.com):

1. **Applications → Create a new application** (or open an existing one) and enable the **Voice** capability.
2. Set **Answer URL** to `https://abc123.ngrok-free.app/answer` (method **GET**).
3. Set **Event URL** to `https://abc123.ngrok-free.app/event`.
4. Under **Link numbers**, link a voice-capable number to the application (buy one under **Numbers → Buy numbers** first if needed).

**4. Call your Vonage number** and start talking.

---

## What to expect

The console prints a per-call transcript:

```
[call 1] Vonage connected
[call 1] Listening — negotiated audio/l16;rate=16000
[call 1] Caller: What's the tallest mountain in Wales?
[call 1] Agent:  That's Snowdon — or Yr Wyddfa — at about 1,085 metres.
[call 1] Keypad: 5 (260 ms)
[call 1] Call ended (socket closed) — disposing pipeline
```

The caller hears the agent's Deepgram TTS voice paced onto the call in 20 ms linear16 frames.

---

## Per-call lifecycle

Everything is constructed **inside the connection handler**: a fresh `VonageAudioSocket`, STT, LLM, and TTS per call. This is the pattern to copy — provider instances hold per-call state (audio queues, conversation history) and must never be shared between concurrent calls. Vonage sends no explicit call-ended message, so the WebSocket `close` event is the hangup signal and triggers a single guarded `agent.dispose()`.

## Barge-in

Unlike Twilio, Vonage has no buffer-clear or playback-acknowledgement protocol. Barge-in still works because the provider paces outbound audio in 20 ms frames — when the caller interrupts, at most ~20 ms of agent audio is buffered on Vonage's side, so the agent stops nearly instantly. `flush()` resolves on a timer derived from the queued duration rather than a platform ack.

---

## Troubleshooting

- **The call answers then drops immediately.** The answer webhook must return valid NCCO JSON over public HTTPS. Hit `https://<ngrok-domain>/answer` in a browser and check for the `connect` action.
- **Caller hears nothing.** The TTS must emit raw `linear16` — compressed formats (mp3/opus) are rejected at `configure()` time. Also make sure the `wss://` URI in the NCCO points at the current ngrok domain.
- **Garbled, slowed, or sped-up audio.** The NCCO `content-type` rate, the STT `sampleRate`, and the TTS `sampleRate` disagree — this example keeps all three at 16000 via one `SAMPLE_RATE` constant.
- **No `websocket:connected` event / socket never opens.** Vonage only connects after the NCCO `connect` action executes — check the event URL logs and that the answer URL is reachable.
- **Choppy audio.** The 20 ms frame pump is being starved — keep heavy synchronous work off the Node event loop.
- **`ERR_UNKNOWN_FILE_EXTENSION` or WebSocket errors at startup.** Use Node 21+ so the global `WebSocket` exists.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [80 — Twilio Phone Agent](../80-twilio-phone-agent/) | The same agent on Twilio's mu-law Media Streams with mark-based flush and `clear` barge-in |
| [61 — Barge-in](../61-barge-in/) | Barge-in mechanics in the browser |
