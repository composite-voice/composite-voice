---
title: TwilioMediaStream
description: Put your voice agent on a phone call with Twilio Media Streams, using bidirectional mu-law audio over a WebSocket your server accepts.
order: 3
---

Use TwilioMediaStream when you want callers to talk to your voice agent over a regular phone call. It is a duplex provider covering both the `input` and `output` pipeline roles: caller audio streams in from Twilio as G.711 mu-law at 8 kHz, and TTS audio streams back into the call the same way. Marks give you accurate `flush()` completion, and Twilio's `clear` message gives you instant barge-in.

## Prerequisites

- A [Twilio](https://www.twilio.com/console) account with a voice-capable phone number
- A server Twilio can reach over `wss://` (use [ngrok](https://ngrok.com) or similar during development)
- A WebSocket server library for your app -- the examples use [`ws`](https://github.com/websockets/ws) with Express

No peer dependencies are required by the provider itself. Twilio connects **to your server**; your app accepts the socket and hands it to the provider with `attach()`. Audio is encoded and decoded with the SDK's built-in G.711 codecs -- no ffmpeg, no native modules.

TwilioMediaStream is server-side only in practice (Twilio must be able to open a WebSocket to you), but the provider itself has zero Node-specific APIs and works with both Node `ws` sockets (`on('message', ...)`) and browser-style sockets (`addEventListener('message', ...)`).

## How a call reaches your agent

1. A caller dials your Twilio number.
2. Twilio requests TwiML from your webhook. You respond with `<Connect><Stream url="wss://..."/>`. Bidirectional audio **requires `<Connect>`** -- `<Start><Stream>` is listen-only.
3. Twilio opens a WebSocket to that URL and sends `connected`, then `start` (carrying the `streamSid`, `callSid`, and any custom parameters), then a steady stream of `media` messages with base64 mu-law payloads.
4. Your connection handler calls `twilio.attach(socket)` and starts the pipeline.

## Basic setup

A minimal Express + `ws` server that serves the TwiML and runs one agent per call:

```typescript
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  CompositeVoice,
  TwilioMediaStream,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from 'composite-voice';

const app = express();

// Twilio fetches this TwiML when the call connects.
// Point your Twilio number's voice webhook at POST /twiml.
app.post('/twiml', (req, res) => {
  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.headers.host}/media">
      <Parameter name="userId" value="42" />
    </Stream>
  </Connect>
</Response>`);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/media' });

wss.on('connection', async (socket) => {
  const twilio = new TwilioMediaStream();

  const agent = new CompositeVoice({
    providers: [
      twilio, // covers input + output
      new DeepgramSTT({
        apiKey: process.env.DEEPGRAM_API_KEY,
        options: { encoding: 'mulaw', sampleRate: 8000 },
      }),
      new AnthropicLLM({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-haiku-4-5',
        systemPrompt: 'You are a helpful phone agent. Keep responses short and conversational.',
      }),
      new DeepgramTTS({
        apiKey: process.env.DEEPGRAM_API_KEY,
        options: { encoding: 'mulaw', sampleRate: 8000 },
      }),
    ],
  });

  twilio.onCallEnded(() => void agent.dispose());

  await agent.initialize();
  await agent.startListening(socket); // attaches the socket and starts capture
});

server.listen(8080);
```

During development, expose the server with `ngrok http 8080` and set your Twilio number's voice webhook to `https://<your-ngrok-domain>/twiml`.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `debug` | `boolean` | `false` | Enable debug logging for wire messages and state transitions |

That is the whole config -- **no credentials**. Twilio authenticates by connecting to the URL in your TwiML; your server decides which connections to accept before the provider ever sees the socket.

## Audio formats

**Input** is fixed by Twilio: G.711 mu-law, 8 kHz, mono. `getMetadata()` reports `{ encoding: 'mulaw', sampleRate: 8000, channels: 1 }`, and the pipeline auto-configures compatible STT providers from it -- with DeepgramSTT you can omit `options.encoding`/`options.sampleRate` entirely and they are filled in for you.

**Output** must reach Twilio as mu-law 8 kHz mono. The provider accepts:

1. **`mulaw` @ 8000 Hz** (recommended) -- passthrough, zero conversion cost. Configure your TTS accordingly, e.g. `DeepgramTTS` with `options: { encoding: 'mulaw', sampleRate: 8000 }`.
2. **`linear16` at any sample rate** -- the provider resamples to 8 kHz and mu-law encodes each chunk for you.

Anything else (mp3, opus, alaw) makes `configure()` throw a `ConfigurationError` telling you how to fix the TTS config. Compressed formats cannot be transcoded without a decoder, so pick a TTS that can emit mulaw or raw PCM -- Deepgram, Cartesia, and ElevenLabs all can.

## Wire protocol

You do not need to touch these messages -- the provider speaks them for you -- but they are useful when reading Twilio debug logs:

| Direction | Message | Provider behavior |
|---|---|---|
| from Twilio | `{"event":"start","start":{"streamSid":"MZ...","callSid":"CA...","customParameters":{...}}}` | Captures SIDs and custom parameters |
| from Twilio | `{"event":"media","media":{"track":"inbound","payload":"<base64 mulaw>"}}` | Decoded and emitted as an `AudioChunk` |
| to Twilio | `{"event":"media","streamSid":"MZ...","media":{"payload":"<base64 mulaw>"}}` | Sent for each enqueued TTS chunk |
| to Twilio | `{"event":"mark","streamSid":"MZ...","mark":{"name":"cv-1"}}` | Sent by `flush()` after a batch of media |
| from Twilio | `{"event":"mark","mark":{"name":"cv-1"}}` | Echo when playback reaches the mark; resolves `flush()` |
| to Twilio | `{"event":"clear","streamSid":"MZ..."}` | Sent by `stop()`; Twilio drops buffered audio (barge-in) |
| from Twilio | `{"event":"stop",...}` | Remote hangup: input stops, pending flushes settle, `onCallEnded` fires |
| from Twilio | `{"event":"dtmf","dtmf":{"digit":"1"}}` | Delivered to your `onDtmf` callback |

## Flush and barge-in

Twilio buffers outbound audio server-side and plays it in real time, so "everything was enqueued" is not the same as "the caller heard it". `flush()` bridges that gap with marks: it sends a named `mark` after the media batch, and resolves only when Twilio echoes the mark back -- i.e. when playback actually reached that point in the call.

`stop()` is barge-in: it sends `clear`, which makes Twilio discard everything buffered but not yet played, and settles any pending `flush()` promises as cancelled (they resolve, so the pipeline never hangs; the late mark echoes Twilio sends after a clear are ignored).

One duplex subtlety: `stop()` dispatches on playback state. While agent audio is playing or queued it acts as barge-in only -- it clears playback but keeps caller-audio capture alive, since barge-in happens precisely because the caller is speaking. With no playback in flight it halts caller-audio emission instead (this is what `stopListening()` uses). `pause()`/`resume()` apply to the input side only -- the turn-taking system uses them to mute capture while the agent speaks, and pausing must never block the agent's own audio from reaching the call.

## Call metadata and DTMF

```typescript
twilio.onCallEnded(() => console.log('Caller hung up'));
twilio.onDtmf((digit) => console.log('Keypad:', digit));

// Available once Twilio's start message arrives:
twilio.getStreamSid(); // 'MZ...'
twilio.getCallSid(); // 'CA...' -- correlate with the Twilio REST API
twilio.getCustomParameters(); // { userId: '42' } from <Parameter> elements in your TwiML
```

Custom parameters are the idiomatic way to pass per-call context (user id, session token) from your webhook into the voice agent.

## Tips and gotchas

- **Use `<Connect><Stream>`, not `<Start><Stream>`.** Only `<Connect>` streams are bidirectional; with `<Start>` your media messages are silently ignored and the caller hears nothing.
- **One provider instance per call.** Create a fresh `TwilioMediaStream` (and pipeline) in each connection handler. `attach()` does replace a previous socket if you must reuse an instance, but per-call instances keep state isolation trivial.
- **Prefer native mulaw TTS.** `options: { encoding: 'mulaw', sampleRate: 8000 }` skips all conversion. The linear16 path works from any sample rate but costs a resample + G.711 encode per chunk.
- **Phone audio is 8 kHz.** Choose an STT model that handles narrowband telephony well (Deepgram's `nova-3` does; pass `options: { model: 'nova-3' }`).
- **The provider never closes your socket.** `detach()` and `dispose()` remove listeners only -- closing the WebSocket (and hanging up via the Twilio REST API if needed) stays in your hands.
- **Enqueued audio before `start` arrives is dropped.** The provider cannot address the stream until Twilio sends the `streamSid`. In practice the pipeline only speaks after the caller does, so this never bites -- but a proactive greeting should wait for the `start` message (check `getStreamSid()`).

## Troubleshooting

- **Caller hears silence.** Almost always `<Start>` instead of `<Connect>` in the TwiML, or TTS audio in a format the provider rejected -- check for a `ConfigurationError` from `configure()` and for `audio.playback.error` events on the agent. (Register playback listeners through the agent's events, not on the provider: the pipeline claims the provider's single `onPlaybackError` slot to report these.)
- **Garbled or chipmunk audio.** The TTS is sending a different format than it declared (e.g. 24 kHz linear16 labelled as 8 kHz). Make sure the TTS `options` match its actual output; with Deepgram set both `encoding` and `sampleRate` explicitly.
- **`flush()` never resolves.** The mark echo is not arriving -- verify the socket is still open and that you attached the provider before the call started flowing. On hangup, detach, or `stop()` pending flushes settle automatically.
- **WebSocket never connects.** Twilio requires `wss://` (TLS) with a certificate it trusts -- plain `ws://` and self-signed certificates fail. ngrok terminates TLS for you in development.
- **No transcriptions.** Confirm the STT is configured for `mulaw`/8000 (or left unset so the pipeline auto-configures it) and that the socket was attached — either via `startListening(socket)` or by calling `attach(socket)` before `startListening()`.

## Related resources

- [Twilio Media Streams documentation](https://www.twilio.com/docs/voice/media-streams)
- [Twilio WebSocket message reference](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
- [API reference: TwilioMediaStream](/api/classes/twiliomediastream)
- [Providers reference](/reference/providers)
