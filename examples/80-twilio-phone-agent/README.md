# Example 80 — Twilio Phone Agent

A voice agent callers can talk to over a regular phone call, using [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams). A plain `node:http` server serves the TwiML webhook, and a `ws` WebSocket server accepts the bidirectional audio stream Twilio opens to it — one CompositeVoice pipeline per call.

| Component | Details |
|-----------|---------|
| **Server** | `node:http` + `ws` on port 3080 |
| **Input/Output** | `TwilioMediaStream` (duplex, G.711 mu-law @ 8 kHz) |
| **STT** | `DeepgramSTT` — `nova-3`, mulaw/8000 |
| **LLM** | `AnthropicLLM` — `claude-haiku-4-5` |
| **TTS** | `DeepgramTTS` — mulaw/8000 (native passthrough) |

---

## What you'll learn

- How to serve `<Connect><Stream>` TwiML from a `POST /twiml` webhook
- How to hand each accepted WebSocket straight to the pipeline with `agent.startListening(socket)`
- The **one-pipeline-per-call** lifecycle: construct providers inside the connection handler, dispose on hangup
- How to log caller transcripts, agent replies, and DTMF keypresses server-side
- How marks and `clear` give the agent accurate flush completion and instant barge-in

---

## Prerequisites

- **Node.js 21+** (or 22 LTS) — the SDK's streaming STT/TTS providers use the global `WebSocket`
- **pnpm** and a build of the SDK (`pnpm install && pnpm build` at the repo root)
- A [Twilio](https://www.twilio.com/console) account with a **voice-capable phone number**
- A [Deepgram API key](https://console.deepgram.com) and an [Anthropic API key](https://console.anthropic.com)
- [ngrok](https://ngrok.com) (or any tunnel that gives you public `https://`/`wss://`)

---

## Setup

```bash
pnpm install && pnpm build   # from the repo root
cd examples/80-twilio-phone-agent
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
ngrok http 3080
```

Copy the forwarding domain, e.g. `https://abc123.ngrok-free.app`.

**3. Point your Twilio number at it**

In the [Twilio Console](https://console.twilio.com):

1. **Phone Numbers → Manage → Active numbers** and pick your number (or **Buy a number** with Voice capability first).
2. Under **Voice Configuration**, set **A call comes in** to **Webhook**.
3. Paste `https://abc123.ngrok-free.app/twiml` as the URL and select **HTTP POST**.
4. Save.

**4. Call your Twilio number** and start talking.

---

## What to expect

The console prints a per-call transcript:

```
[call 1] Twilio connected
[call 1] Listening — callSid (pending start message)
[call 1] Caller: What's the tallest mountain in Wales?
[call 1] Agent:  That's Snowdon — or Yr Wyddfa — at about 1,085 metres.
[call 1] Keypad: 5
[call 1] Call ended (caller hung up) — disposing pipeline
```

The caller hears the agent's Deepgram TTS voice with sub-second turnaround.

---

## Per-call lifecycle

Everything is constructed **inside the connection handler**: a fresh `TwilioMediaStream`, STT, LLM, and TTS per call. This is the pattern to copy — provider instances hold per-call state (stream SIDs, audio queues, conversation history) and must never be shared between concurrent calls. Teardown is symmetric: `twilio.onCallEnded()` (Twilio's `stop` event) and the socket `close` event both funnel into a single guarded `agent.dispose()`.

## Barge-in

Interrupting the agent mid-sentence works out of the box. Twilio buffers outbound audio server-side, so when the caller starts speaking the provider sends Twilio's `clear` message, which discards everything buffered but not yet played — the agent stops talking almost instantly instead of finishing a long reply. Marks make `flush()` resolve only when the caller has actually *heard* the audio, so turn-taking stays accurate.

---

## Troubleshooting

- **Caller hears silence.** The TwiML must use `<Connect><Stream>` — `<Start><Stream>` is listen-only. Also confirm the TTS is configured for `mulaw`/8000; other compressed formats are rejected at `configure()` time.
- **Webhook errors in the Twilio debugger.** The webhook must be reachable over public HTTPS and answer `POST /twiml` with `text/xml`. Check the ngrok URL is current — free ngrok domains change on every restart.
- **WebSocket never connects.** Twilio requires `wss://` with a trusted certificate; ngrok terminates TLS for you. Plain `ws://` or self-signed certs fail silently.
- **No transcriptions.** Confirm `DEEPGRAM_API_KEY` is set and the STT options say `mulaw`/8000 (phone audio is narrowband).
- **`ERR_UNKNOWN_FILE_EXTENSION` or WebSocket errors at startup.** Use Node 21+ so the global `WebSocket` exists.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [81 — Vonage Phone Agent](../81-vonage-phone-agent/) | The same agent on Vonage's linear16 WebSocket bridge |
| [61 — Barge-in](../61-barge-in/) | Barge-in mechanics in the browser |
