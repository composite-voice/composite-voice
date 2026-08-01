---
title: TeamsCall
description: Put a voice agent in a Microsoft Teams meeting as an external participant using the Azure Communication Services calling SDK.
order: 9
---

Use TeamsCall when you want your voice agent to join a Microsoft Teams meeting like any other participant -- hearing the meeting's mixed audio and speaking synthesized responses into it. TeamsCall is a duplex provider: one instance fills both the `input` and `output` pipeline roles, so you pair it with your STT, LLM, and TTS providers of choice.

TeamsCall runs **in the browser only**. It uses the Azure Communication Services (ACS) JavaScript calling SDK (which is browser-only) plus the Web Audio API to bridge call audio to the pipeline.

## Prerequisites

- An [Azure Communication Services resource](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/create-communication-resource) in your Azure subscription
- A server-side endpoint that issues **ACS user access tokens** with the `voip` scope using the [Identity SDK or REST API](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/identity/access-tokens) -- never expose your resource connection string to the browser
- A Teams meeting **join link** (`https://teams.microsoft.com/l/meetup-join/...`), e.g. from the Outlook/Teams invite or the Graph API
- The two optional peer dependencies installed in your app:

```bash
pnpm add @azure/communication-calling @azure/communication-common
```

TeamsCall imports both packages dynamically at `initialize()` time, so apps that do not use it never load them. If they are missing, `initialize()` throws a `ProviderInitializationError` with install instructions.

Teams interop (external users joining Teams meetings via ACS) works for meetings whose tenant allows anonymous/external join. No Teams license is required for the agent itself; standard ACS calling rates apply.

## Basic setup

```typescript
import {
  CompositeVoice,
  TeamsCall,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const teams = new TeamsCall({
  token: async () => {
    const res = await fetch('/api/acs-token'); // your server mints the token
    return (await res.json()).token;
  },
  displayName: 'Voice Agent',
  meetingLink: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_...',
});

teams.onCallStateChanged((state) => {
  if (state === 'InLobby') console.log('Waiting in the lobby for admission...');
  if (state === 'Connected') console.log('Joined the meeting');
  if (state === 'Disconnected') console.log('Call ended');
});

const agent = new CompositeVoice({
  providers: [
    teams, // fills both 'input' and 'output'
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful meeting assistant. Keep responses brief.',
    }),
    new DeepgramTTS({
      proxyUrl: '/api/proxy/deepgram',
      encoding: 'linear16',
      sampleRate: 24000,
    }),
  ],
});

await agent.initialize(); // joins the meeting
await agent.startListening();
```

`initialize()` joins the meeting; the call may then sit in the Teams lobby until a participant admits the agent (see below). Once connected, the meeting's mixed remote audio flows to your STT provider as 16 kHz mono linear16 PCM -- the pipeline configures the STT format automatically from `getMetadata()`.

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `meetingLink` | `string` | -- (required) | Teams meeting join URL (`https://teams.microsoft.com/l/meetup-join/...`) |
| `token` | `string \| () => Promise<string>` | -- | ACS user access token, or an async factory returning a fresh one (resolved once at `initialize()`) |
| `tokenCredential` | `AzureCommunicationTokenCredential` | -- | Pre-built credential; takes precedence over `token`. Use for proactive refresh on long calls |
| `displayName` | `string` | `'Voice Agent'` | Name shown to other meeting participants |
| `debug` | `boolean` | `false` | Enable debug logging |

One of `token` or `tokenCredential` is required.

## Authentication

ACS user access tokens are short-lived credentials minted from your ACS resource. Issue them server-side (Node example):

```typescript
import { CommunicationIdentityClient } from '@azure/communication-identity';

const client = new CommunicationIdentityClient(process.env.ACS_CONNECTION_STRING);
const user = await client.createUser();
const { token } = await client.getToken(user, ['voip']);
// return `token` to the browser
```

Tokens expire (24 hours by default). For meetings that may outlast the token, construct an `AzureCommunicationTokenCredential` with a refresh callback yourself and pass it as `tokenCredential` -- TeamsCall never disposes credentials it did not create.

## The lobby

Most Teams tenants send external participants to a lobby. While waiting, the call state is `'InLobby'` and **no remote audio flows** -- the agent cannot hear or be heard until a participant admits it. Surface this in your UI via `onCallStateChanged()`. If the tenant's meeting policy blocks anonymous join entirely, the call moves to `'Disconnected'` shortly after joining.

## Audio formats

- **Input (meeting → STT):** 16 kHz mono 16-bit linear PCM (`linear16`). The browser's native capture rate (typically 48 kHz) is resampled internally.
- **Output (TTS → meeting):** `configure()` accepts:
  - `linear16` at **any** sample rate (recommended -- e.g. `DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })`); the browser resamples on playback
  - `mulaw` / `alaw` (decoded with the SDK's built-in G.711 codecs)
  - `mp3` (decoded with `decodeAudioData`)

  Containerless `opus` is rejected with an error telling you how to reconfigure your TTS provider.

Playback into the meeting mirrors `BrowserAudioOutput`'s scheduling: chunks buffer for ~200 ms, are merged and scheduled gaplessly through an `AudioContext`, and `stop()` (barge-in) cancels pending audio immediately.

## Duplex behavior

Because one instance covers both roles, the shared lifecycle methods have call-centric semantics:

- `stop()` dispatches on playback state. While audio is queued or playing it acts as barge-in: playback into the meeting halts and buffered audio is cleared, but capture deliberately survives -- interrupting the agent depends on hearing the very speech that triggered the interruption. With nothing playing, `stop()` halts meeting-audio emission instead (this is what `stopListening()` uses).
- `pause()`/`resume()` gate **input** emission (used by turn-taking); they never suspend the agent's own speech.
- To stop hearing the meeting, leave it: call `teams.hangUp()` (stays initialized, can rejoin only via a fresh `initialize()` after `dispose()`) or `dispose()` (full cleanup: hangs up, disposes the call agent and owned credential, closes audio contexts).

## Remote audio acquisition

The ACS `Call` object exposes the meeting's mixed remote audio as `call.remoteAudioStreams[0]`. The SDK reference documents a `remoteAudioStreamsUpdated` event, but the raw media access quickstart demonstrates only checking the property after the call state becomes `'Connected'`. TeamsCall therefore subscribes to both the event and `stateChanged`, **and** polls `remoteAudioStreams` every 500 ms until the stream is acquired -- whichever fires first wins, so audio is captured promptly regardless of SDK version behavior.

## Troubleshooting

- **`ProviderInitializationError: @azure/communication-calling is required`** -- install both peer dependencies: `pnpm add @azure/communication-calling @azure/communication-common`.
- **Stuck in `InLobby`** -- a meeting participant must admit the agent; check the tenant/organizer lobby settings ("Who can bypass the lobby?").
- **Joins then immediately disconnects** -- the tenant likely blocks anonymous join, the meeting link is malformed, or the token lacks the `voip` scope / has expired.
- **Agent hears nothing after connecting** -- browsers require a user gesture before an `AudioContext` may run; initialize the pipeline from a click handler. Also confirm other participants are unmuted.
- **Agent's speech is silent in the meeting** -- verify your TTS emits a supported encoding (`configure()` throws for unsupported ones) and that the call is `'Connected'`, not `'InLobby'`.
- **`stop()` didn't stop listening** -- while agent audio is in flight, `stop()` is barge-in by design and keeps capture alive; when idle it does halt emission. Use `hangUp()` or `dispose()` to leave the call entirely.

## Related resources

- [ACS raw media access quickstart](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/voice-video-calling/get-started-raw-media-access?pivots=platform-web)
- [ACS Teams interop overview](https://learn.microsoft.com/en-us/azure/communication-services/concepts/teams-interop)
- [Issue ACS user access tokens](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/identity/access-tokens)
- [API reference: TeamsCall](/api/classes/teamscall)
