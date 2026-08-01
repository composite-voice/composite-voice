---
title: GoogleMeetInput
description: Stream a Google Meet conference's mixed audio into your voice pipeline over WebRTC using the Meet Media API.
order: 8
---

Use GoogleMeetInput when you want a voice agent to listen to a live Google Meet conference — meeting transcription, note-taking, or real-time analysis. The provider joins an active conference over WebRTC via the Google Meet Media API and emits the meeting's mixed audio as 16 kHz mono linear16 chunks, ready for any live STT provider.

:::caution[Developer Preview enrollment required]
The Meet Media API is a **Developer Preview** API. Your Google Cloud project must be enrolled in the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), **and every participant in the conference must belong to an enrolled account**. Requests from non-enrolled projects fail with `PERMISSION_DENIED`, and conferences with non-enrolled participants cannot be joined. Expect breaking changes until the API reaches general availability.
:::

## Prerequisites

- A Google Cloud project enrolled in the Developer Preview with the **Google Meet Media API** enabled
- An OAuth 2.0 access token with the scope `https://www.googleapis.com/auth/meetings.conference.media.audio.readonly` (or the broader `.media.readonly`)
- The **space name** of the meeting (`spaces/{space}`), with an **active** conference in progress
- A browser (or WebRTC-capable runtime): the provider uses `RTCPeerConnection`, `fetch`, and `AudioContext`

No peer dependencies are required — GoogleMeetInput is a zero-dependency browser provider.

## Receive-only: pair with an output provider

The Meet Media API only **receives** media; there is no way to inject audio back into the conference. GoogleMeetInput therefore covers just the `'input'` role. Pair it with `NullOutput` for listen-only pipelines, or with another output provider (e.g. `BrowserAudioOutput`) if the agent should speak somewhere other than the meeting.

## Basic setup

```typescript
import {
  CompositeVoice,
  GoogleMeetInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  NullOutput,
} from '@lukeocodes/composite-voice';

const meet = new GoogleMeetInput({
  // OAuth access token — prefer an async factory so a fresh token is used
  apiKey: async () => fetchAccessToken(),
  spaceName: 'spaces/jQCFfuBOdN5z',
});

meet.onSessionStatus((status) => {
  console.log('Meet session:', status.connectionState, status.disconnectReason ?? '');
});

const agent = new CompositeVoice({
  providers: [
    meet,
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'Summarize what is being discussed in the meeting.',
    }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
    new NullOutput(), // Meet is receive-only — audio cannot go back into the call
  ],
});

await agent.initialize(); // joins the conference
await agent.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string \| () => Promise<string>` | -- | **Required.** OAuth access token with a Meet Media API audio scope, or an async factory returning a fresh token |
| `spaceName` | `string` | -- | **Required.** Meet space resource name in the form `spaces/{space}` |
| `endpoint` | `string` | `'https://meet.googleapis.com'` | Base URL override for the Meet Media API |
| `enableMediaEntries` | `boolean` | `false` | Also open the optional `media-entries` data channel (participant/CSRC metadata; not consumed by the provider) |
| `debug` | `boolean` | `false` | Enable debug logging |

See the [API reference](/api/classes/googlemeetinput) for the full list.

## Resolving the space name

`spaceName` is not the meeting code from the URL. Resolve a meeting code (e.g. `abc-mnop-xyz`) to a space resource with the [Meet REST API `spaces.get`](https://developers.google.com/meet/api/reference/rest/v2/spaces/get) method:

```typescript
const res = await fetch('https://meet.googleapis.com/v2/spaces/abc-mnop-xyz', {
  headers: { Authorization: `Bearer ${token}` },
});
const space = await res.json();
// space.name === 'spaces/jQCFfuBOdN5z'  ← pass this to GoogleMeetInput
// space.activeConference is set while a conference is running
```

The conference must be **active** when `initialize()` is called — `connectActiveConference` fails otherwise (check `space.activeConference` first).

## How it works

On `initialize()` the provider:

1. Creates an `RTCPeerConnection` (Google STUN, `max-bundle`).
2. Adds exactly **3 receive-only audio transceivers** — Meet mixes the three most relevant audio streams across three virtual SSRCs (Opus).
3. Opens the required `session-control` and `media-stats` data channels (reliable, ordered) before creating the SDP offer.
4. POSTs the offer to `{spaceName}:connectActiveConference` with your Bearer token and applies the returned SDP answer.
5. Mixes the incoming audio tracks through a shared `AudioContext` (AudioWorklet preferred, ScriptProcessor fallback) and emits downsampled 16 kHz mono linear16 chunks while started.

Session lifecycle updates (`STATE_WAITING` → `STATE_JOINED` → `STATE_DISCONNECTED`) arrive on the `session-control` channel and are surfaced via `onSessionStatus()`. On disconnect (conference ended, session stopped, or unhealthy) the provider tears down the WebRTC session automatically. `dispose()` sends the Meet `leave` request before closing.

The `media-stats` channel is serviced per Google's reference client: nothing is uploaded until the server sends its configuration (upload interval + field allowlist), after which the provider uploads filtered `getStats()` snapshots on the server's schedule.

## Audio format

`getMetadata()` reports `linear16`, 16000 Hz, mono, 16-bit — the pipeline auto-configures your STT provider to match. All active speakers arrive pre-mixed in the emitted stream; per-speaker separation is not available through this provider.

## Troubleshooting

- **`PERMISSION_DENIED` from `connectActiveConference`.** Your project (or a participant's account) is not enrolled in the Developer Preview, or the token is missing the `meetings.conference.media.audio.readonly` scope.
- **`FAILED_PRECONDITION` / connection error at initialize.** There is no active conference in the space. Someone must be in the meeting before the provider connects — check `space.activeConference` via `spaces.get`.
- **Token expired mid-session.** The token is only used once, at connect time, so expiry does not drop an established session. Use an async `apiKey` factory so reconnects (re-`initialize()` after `dispose()`) always get a fresh token.
- **No audio chunks arriving.** Confirm `start()` was called after `initialize()`, and watch `onSessionStatus()` — chunks flow only once the session reaches `STATE_JOINED` and Meet starts sending tracks. If the session sits in `STATE_WAITING`, the media client may be pending admission to the meeting.
- **Agent replies are not heard in the meeting.** Expected: the Meet Media API is receive-only. Route TTS elsewhere (e.g. `BrowserAudioOutput` locally) or use `NullOutput`.
- **Running in Node.** `RTCPeerConnection` and `AudioContext` are browser APIs; the provider throws `ProviderInitializationError` without them. Run in a browser context (or an Electron renderer / headless Chromium).

## Related resources

- [Meet Media API overview](https://developers.google.com/meet/media-api/guides/overview)
- [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview)
- [Meet REST API spaces.get](https://developers.google.com/meet/api/reference/rest/v2/spaces/get)
- [API reference: GoogleMeetInput](/api/classes/googlemeetinput)
