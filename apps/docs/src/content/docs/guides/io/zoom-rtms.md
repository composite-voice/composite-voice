---
title: ZoomRtmsInput
description: Stream live Zoom meeting audio into your voice pipeline with Zoom's Realtime Media Streams (RTMS) protocol.
order: 7
---

Use ZoomRtmsInput when you want a server-side voice agent to listen to a live Zoom meeting -- transcribing, summarizing, or reacting to what participants say in real time. The provider implements Zoom's Realtime Media Streams (RTMS) WebSocket protocol directly with zero dependencies: it authenticates with a WebCrypto HMAC-SHA256 signature, negotiates the signaling and media handshakes, answers keep-alives, and emits raw L16 PCM audio chunks into the pipeline.

RTMS is **receive-only**. There is no way to play audio back into the meeting over this protocol, so pair ZoomRtmsInput with `NullOutput` (and consume the agent's responses via events, transcripts, chat, or another channel).

## Prerequisites

- A Zoom account with [Realtime Media Streams access](https://developers.zoom.us/docs/rtms/) (RTMS requires Zoom Developer Pack credits)
- A Zoom app (General app from the [Zoom App Marketplace](https://marketplace.zoom.us)) with:
  - **Realtime Media Streams enabled** in the app's Features, with the meeting RTMS scopes added (e.g. `rtms:read:rtms_started`, `rtms:read:rtms_stopped`)
  - **Event subscriptions** for the `meeting.rtms_started` and `meeting.rtms_stopped` webhook events, pointing at an endpoint your server exposes
  - The app installed/authorized on the account whose meetings you want to stream
- The app's **Client ID** and **Client Secret** available to your server

No peer dependencies are required. ZoomRtmsInput runs server-side only (Node.js 18+, Bun, Deno): the client secret is used as an HMAC signing key and must never be shipped to a browser.

## How it works

Zoom does not accept inbound connections for RTMS out of the blue -- your server is told where to connect:

1. When a meeting with RTMS starts, Zoom POSTs a `meeting.rtms_started` webhook containing `meeting_uuid`, `rtms_stream_id`, and `server_urls` (the signaling WebSocket URL).
2. You call `zoom.connect({ meetingUuid, rtmsStreamId, serverUrl })` with those values.
3. The provider opens the **signaling** socket and sends a handshake signed with `hex(HMAC-SHA256("clientId,meetingUuid,rtmsStreamId", clientSecret))`.
4. Zoom returns the **media** server URLs; the provider connects to the audio media socket, requests raw L16 PCM (16 kHz mono by default), and acknowledges readiness back on the signaling socket.
5. Audio arrives as base64-encoded PCM messages and is emitted as `AudioChunk`s while the provider is started.

On the `meeting.rtms_stopped` webhook (or when Zoom reports the stream terminated), call `zoom.disconnect()` -- the provider closes the media socket first, then signaling.

## Basic setup

```typescript
import express from 'express';
import { CompositeVoice, ZoomRtmsInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, NullOutput } from 'composite-voice';

const zoom = new ZoomRtmsInput({
  clientId: process.env.ZOOM_CLIENT_ID!,
  clientSecret: process.env.ZOOM_CLIENT_SECRET!,
});

const agent = new CompositeVoice({
  providers: [
    zoom,
    new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY! }),
    new AnthropicLLM({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a meeting assistant. Summarize each request in one sentence.',
    }),
    new DeepgramTTS({ apiKey: process.env.DEEPGRAM_API_KEY! }),
    new NullOutput(), // RTMS is receive-only: no audio goes back into the meeting
  ],
});

agent.on('response.text', (event) => {
  console.log('Assistant:', event.text); // deliver via chat, Slack, etc.
});

await agent.initialize();

// Webhook endpoint registered in your Zoom app's event subscriptions
const app = express();
app.use(express.json());

app.post('/zoom/webhook', async (req, res) => {
  const { event, payload } = req.body;

  if (event === 'meeting.rtms_started') {
    const { meeting_uuid, rtms_stream_id, server_urls } = payload.object;
    // startListening() accepts the RTMS session directly (equivalent to
    // zoom.connect(session) followed by startListening()).
    await agent.startListening({
      meetingUuid: meeting_uuid,
      rtmsStreamId: rtms_stream_id,
      serverUrl: server_urls,
    });
  }

  if (event === 'meeting.rtms_stopped') {
    await zoom.disconnect();
  }

  res.status(200).send('OK');
});

app.listen(3000);
```

Your webhook endpoint should also implement Zoom's [endpoint URL validation](https://developers.zoom.us/docs/api/webhooks/#validate-your-webhook-endpoint) challenge, and acknowledge events quickly (respond 200 first or connect asynchronously) to avoid Zoom retrying the start flow.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | -- | Zoom app Client ID (required, part of the HMAC signature message) |
| `clientSecret` | `string` | -- | Zoom app Client Secret (required, HMAC signing key -- server-side only) |
| `meetingUuid` | `string` | -- | Meeting UUID, if known up-front (usually passed to `connect()` instead) |
| `rtmsStreamId` | `string` | -- | RTMS stream ID, if known up-front |
| `serverUrl` | `string` | -- | Signaling server URL, if known up-front |
| `sampleRate` | `8000 \| 16000 \| 32000 \| 48000` | `16000` | Audio sample rate requested from Zoom |
| `dataOpt` | `'mixed' \| 'per-participant'` | `'mixed'` | One mixed stream, or one stream per active speaker |
| `connectionTimeout` | `number` | `10000` | Timeout in milliseconds for each connection/handshake step |
| `debug` | `boolean` | `false` | Enable diagnostic logging |

## Audio format

ZoomRtmsInput emits raw linear16 (16-bit signed little-endian PCM) mono audio at the configured sample rate, in roughly 100 ms chunks. `getMetadata()` reports this, so the pipeline auto-configures your STT provider -- the 16 kHz default matches what most streaming STT providers want.

## Per-participant audio

With the default `dataOpt: 'mixed'`, Zoom sends a single stream with all participants mixed -- the right choice for a voice-agent pipeline, since STT receives one coherent stream.

With `dataOpt: 'per-participant'`, Zoom sends a separate stream per active speaker. All chunks still arrive on the main `onAudio()` callback (and interleave when people talk over each other), so use the `onSpeakerAudio()` extra to attribute chunks:

```typescript
zoom.onSpeakerAudio((userId, userName, chunk) => {
  console.log(`${userName ?? userId}: ${chunk.data.byteLength} bytes`);
});
```

## Receive-only: pairing an output

RTMS cannot inject audio into the meeting, so the `'output'` role needs a different destination:

- `NullOutput` -- discard synthesized audio and consume the agent's text via `response.text` events (post to meeting chat, Slack, a dashboard, ...).
- Any other output provider -- e.g. stream the agent's voice to a separate listener page.

If you skip the TTS/output stages entirely, configure your pipeline for text-only responses instead.

## Errors and status codes

Handshake failures reject `connect()` with a `ProviderConnectionError` whose cause names the RTMS status code, e.g. `Zoom RTMS signaling handshake failed with status 3 (STATUS_INVALID_SIGNATURE)`. The full lookup table is exported as `ZOOM_RTMS_STATUS_CODES`. Common ones:

| Code | Name | Usual cause |
|---|---|---|
| 2 | `STATUS_INVALID_RTMS_STREAM_ID` | Stream already ended, or webhook values mixed up between meetings |
| 3 | `STATUS_INVALID_SIGNATURE` | `clientSecret` does not match `clientId`, or credentials were regenerated |
| 8 | `STATUS_DUPLICATE_SIGNAL_REQUEST` | A previous signaling connection for the same stream is still open |
| 20 | `STATUS_INVALID_MEDIA_AUDIO_SAMPLE_RATE` | Requested sample rate rejected by the media server |

## Tips and gotchas

- **Server-side only.** The client secret signs every handshake. Never instantiate this provider in a browser.
- **One provider instance per stream.** The provider manages one signaling + media socket pair. To join multiple simultaneous meetings, create one `ZoomRtmsInput` (or one pipeline) per meeting.
- **`start()` and `connect()` are independent.** `start()`/`stop()` gate chunk emission; `connect()`/`disconnect()` manage the sockets. Call them in either order -- audio flows once both are done.
- **Keep-alives are handled for you.** Zoom pings both sockets (~every 10 s) and closes connections that do not answer; the provider echoes each ping automatically.
- **No automatic reconnection.** If a socket drops mid-meeting, Zoom treats a fresh signaling connection as a new handshake (and rejects duplicates), so the provider leaves reconnection to you: call `connect()` again with the same session parameters.
- **Zoom ends the stream, not you.** When the meeting ends or the host stops RTMS, the provider observes the session/stream state updates and closes both sockets cleanly -- `isConnected()` turns false. Use the `meeting.rtms_stopped` webhook as your authoritative cleanup signal.
- **Meeting UUIDs contain special characters.** Pass `meeting_uuid` through verbatim -- do not URL-encode or otherwise transform it, or the signature will not match.

## Troubleshooting

- **`connect()` rejects with `STATUS_INVALID_SIGNATURE`** -- verify the Client ID/Secret pair belongs to the same app that has RTMS enabled, and that you rotated both after regenerating credentials.
- **`connect()` times out waiting for a handshake response** -- check that your server can reach `wss://` endpoints (no egress proxy stripping WebSocket upgrades) and that you connected promptly; webhook-delivered URLs are meant to be used right away.
- **Webhook never arrives** -- confirm the event subscription includes `meeting.rtms_started`, the endpoint passed Zoom's URL validation, RTMS auto-start is enabled (or the stream is started on demand), and the app is authorized for the meeting host's account.
- **No audio chunks despite a successful connect** -- make sure `start()` was called (chunks are dropped while stopped/paused) and that participants are unmuted.
