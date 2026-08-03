---
title: VonageAudioSocket
description: Put a voice agent on a phone call with the Vonage Voice API WebSocket endpoint, streaming linear16 audio both ways over a socket your server accepts.
order: 4
---

Use VonageAudioSocket when you want callers on a Vonage (formerly Nexmo) phone number to talk to your voice agent. Vonage bridges the call to your server over a WebSocket: the caller's audio arrives as raw linear16 PCM binary frames, and linear16 frames you send back are played into the call. VonageAudioSocket is a duplex provider — one instance covers both the `input` and `output` pipeline roles.

## Prerequisites

- A [Vonage API account](https://dashboard.nexmo.com) with a Voice-enabled application and a linked phone number
- A public `wss://` endpoint on your server that Vonage can reach (use a tunnel such as ngrok during development)

No peer dependencies and no API keys are required by the provider itself. Vonage opens the WebSocket **to** your server; your application accepts the connection (for example with the [`ws`](https://github.com/websockets/ws) package) and hands the socket to the provider with `attach()`.

## How a call reaches your agent

When a call comes in, Vonage fetches an NCCO (Nexmo Call Control Object) from your application's answer URL. Return a `connect` action with a `websocket` endpoint to bridge the caller to your server:

```json
[
  {
    "action": "connect",
    "endpoint": [
      {
        "type": "websocket",
        "uri": "wss://example.com/vonage",
        "content-type": "audio/l16;rate=16000"
      }
    ]
  }
]
```

Vonage then connects to `uri` and sends, in order:

1. A JSON text frame `{"event":"websocket:connected","content-type":"audio/l16;rate=16000",...}` — the provider parses the sample rate from `content-type` (8000, 16000, or 24000 Hz; 16000 is the default).
2. Binary frames of raw linear16 signed little-endian PCM, mono, about 20 ms each (640 bytes at 16 kHz).
3. JSON text frames `{"event":"websocket:dtmf","digit":"5","duration":260}` when the caller presses keys.

Audio you send back must be binary linear16 frames at the same rate. The provider slices TTS audio into 20 ms frames and paces them on a 20 ms timer — Vonage expects a steady stream, not one large burst.

## Basic setup

```typescript
import { WebSocketServer } from 'ws';
import {
  CompositeVoice,
  VonageAudioSocket,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from 'composite-voice';

const vonage = new VonageAudioSocket();

const agent = new CompositeVoice({
  providers: [
    vonage,
    new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
    new AnthropicLLM({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant on a phone call. Keep responses brief.',
    }),
    new DeepgramTTS({
      apiKey: process.env.DEEPGRAM_API_KEY,
      encoding: 'linear16',
      sampleRate: 16000, // match your NCCO content-type rate
    }),
  ],
});

await agent.initialize();

const wss = new WebSocketServer({ port: 3000, path: '/vonage' });
wss.on('connection', async (socket) => {
  await agent.startListening(socket); // attaches the socket and starts capture
});
```

### Server sketch with the answer webhook

A minimal Express server that serves the NCCO and accepts the audio socket:

```typescript
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const app = express();

app.get('/webhooks/answer', (req, res) => {
  res.json([
    {
      action: 'connect',
      endpoint: [
        {
          type: 'websocket',
          uri: `wss://${req.hostname}/vonage`,
          'content-type': 'audio/l16;rate=16000',
        },
      ],
    },
  ]);
});

app.post('/webhooks/events', (req, res) => res.sendStatus(200));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/vonage' });
wss.on('connection', async (socket) => {
  vonage.attach(socket);
  await agent.startListening();
});

server.listen(3000);
```

Set the answer URL of your Vonage application to `https://example.com/webhooks/answer`.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `debug` | `boolean` | `false` | Enable debug logging for wire events and the outbound frame pump |

The provider needs no credentials — authenticate the call in your webhook layer (e.g. verify Vonage's JWT-signed webhooks) before attaching the socket.

### Extra methods beyond the provider interfaces

| Method | Description |
|---|---|
| `attach(socket)` | Attach the WebSocket Vonage opened to your server. Node `ws` sockets and browser-style sockets both work. Re-attaching replaces the previous socket |
| `detach()` | Remove listeners from the current socket and drop queued outbound audio. The socket itself is not closed |
| `onDtmf(cb)` | Receive keypad presses as `(digit, duration)` |
| `getContentType()` | The raw `content-type` from the `websocket:connected` event, or `null` before it arrives |

## Audio formats

**Inbound** audio is always emitted as linear16 mono, 16-bit, at the negotiated rate. `getMetadata()` reports this so the pipeline can auto-configure STT — but note it is read at initialization time, before Vonage connects, so it reports 16000 Hz until the `websocket:connected` event arrives. Either use `audio/l16;rate=16000` in your NCCO (recommended), or explicitly configure your STT provider's sample rate to match your NCCO.

**Outbound** (TTS) audio is converted automatically:

- `linear16` at the negotiated rate — passed through unchanged.
- `linear16` at any other rate — resampled with linear interpolation (e.g. 24 kHz TTS onto a 16 kHz call).
- `mulaw` / `alaw` — G.711-decoded to linear16, then resampled if needed.
- `opus` / `mp3` — **rejected** by `configure()`. The provider cannot decode compressed audio server-side; configure your TTS provider for raw PCM instead, e.g. `new DeepgramTTS({ encoding: 'linear16', sampleRate: 16000 })`.

## DTMF

```typescript
vonage.onDtmf((digit, duration) => {
  console.log(`Caller pressed ${digit}${duration ? ` for ${duration} ms` : ''}`);
});
```

## Duplex semantics

Because one instance fills both the `input` and `output` slots, the shared lifecycle methods follow the semantics CompositeVoice relies on during a call:

- `stop()` dispatches on playback state. While outbound audio is queued or being delivered it acts as barge-in only: the outbound queue and pacing pump are cleared, pending `flush()` promises settle, and the caller is **not** muted — barge-in happens precisely because the caller is speaking. With nothing playing, `stop()` halts inbound emission instead (this is what `stopListening()` uses); restart with `start()`.
- `pause()` / `resume()` gate the **input** side only (turn-taking mutes the caller while the agent speaks). Outbound playback is unaffected, so `flush()` cannot deadlock.
- `flush()` resolves on a timer: Vonage has no playback acknowledgement, so the provider tracks the queued duration and resolves one 20 ms tick after the final frame is sent.

## Tips and gotchas

- **Match the NCCO rate to your STT rate.** `audio/l16;rate=16000` is the sweet spot: it is Vonage's default and what most STT providers expect. 8000 Hz saves bandwidth at a quality cost; 24000 Hz is rarely needed for speech.
- **One provider instance per call.** A `VonageAudioSocket` handles a single socket at a time. For concurrent calls, create one pipeline (or one provider instance) per call and `attach()` each accepted socket to its own instance.
- **Vonage does not send a clear/mark protocol.** Unlike Twilio Media Streams there is no buffer-clear message and no playback acknowledgement. Barge-in works because the provider paces frames — at most ~20 ms of audio is buffered on Vonage's side when `stop()` halts the pump.
- **Partial tail frames wait for `flush()`.** While TTS is streaming, a leftover chunk smaller than 20 ms is held (padding it mid-stream would inject silence). `flush()` marks the end of the response and sends the tail zero-padded.
- **The provider never closes the socket.** Your application owns the WebSocket lifecycle; `detach()` and `dispose()` only remove the provider's listeners.
- **Audio enqueued before `attach()` is kept** and starts draining as soon as a socket is attached.

## Troubleshooting

- **The caller hears nothing.** Check that your TTS provider emits `linear16` at a supported rate — if `configure()` threw (e.g. for `mp3`), the pipeline surfaces a `ConfigurationError` telling you what to change. Also confirm your server is sending binary (not text) frames; the provider does this for you as long as the attached socket's `send` accepts binary data.
- **Transcriptions are garbled or slowed/sped up.** The STT sample rate does not match the negotiated call rate. Align your NCCO `content-type` rate, the STT provider's `sampleRate`, and (for best quality) the TTS `sampleRate`.
- **`attach()` throws `ConfigurationError`.** The object you passed exposes neither `on()` (Node `ws`) nor `addEventListener()` (browser-style). Pass the accepted WebSocket itself, not the server or the upgrade request.
- **No `websocket:connected` event arrives.** Vonage only opens the socket after the NCCO `connect` action executes — verify your answer webhook returns valid JSON and the `uri` is publicly reachable over `wss://`.
- **Choppy audio on the call.** Something is blocking the Node event loop, so the 20 ms pump ticks late. Keep heavy work (LLM calls, file I/O) async and off the hot path.

## Related resources

- [Vonage Voice API WebSockets concept](https://developer.vonage.com/en/voice/voice-api/concepts/websockets)
- [NCCO connect action reference](https://developer.vonage.com/en/voice/voice-api/ncco-reference#connect)
- [API reference: VonageAudioSocket](/api/classes/vonageaudiosocket)
- [Providers reference](/reference/providers)
