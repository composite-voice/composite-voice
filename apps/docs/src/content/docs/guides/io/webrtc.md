---
title: WebRTCInput + WebRTCOutput
description: Connect your voice agent to any WebRTC session -- LiveKit, Daily, or a custom SFU -- by consuming a remote audio track and producing a publishable one.
order: 2
---

Use WebRTCInput and WebRTCOutput when your voice agent lives inside a WebRTC session -- a LiveKit or Daily room, a 1:1 `RTCPeerConnection` call, or any custom SFU. They are the generic building blocks for "join anything WebRTC": your application owns the peer connection (signaling, ICE, reconnection), and the providers only convert between WebRTC tracks and the pipeline's audio chunks. `WebRTCInput` extracts linear16 PCM from a remote `MediaStreamTrack` for the STT stage; `WebRTCOutput` renders TTS audio into a local `MediaStreamTrack` you publish back to the session.

Both providers are browser-only (they use the Web Audio API) and have **no peer dependencies and no credentials** -- authentication belongs to your signaling layer.

## Prerequisites

- A browser environment with the Web Audio API (`AudioContext`)
- An application-managed WebRTC connection (raw `RTCPeerConnection` or an SFU SDK such as `livekit-client` or `@daily-co/daily-js`) that gives you remote audio tracks and accepts a local track

No API keys and no peer dependency installs are required for the providers themselves.

## Basic setup

```typescript
import {
  CompositeVoice,
  WebRTCInput,
  WebRTCOutput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const input = new WebRTCInput({ targetSampleRate: 16000 });
const output = new WebRTCOutput({ sampleRate: 48000 });

const agent = new CompositeVoice({
  providers: [
    input,
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram', encoding: 'linear16', sampleRate: 24000 }),
    output,
  ],
});

await agent.initialize();

// The app owns the peer connection; wire the tracks both ways
const pc = new RTCPeerConnection();

// Remote participant audio -> pipeline
pc.ontrack = (event) => {
  if (event.track.kind === 'audio') input.setTrack(event.track);
};

// Pipeline (agent voice) -> remote participants
pc.addTrack(output.getTrack(), output.getStream());

// ...your signaling: createOffer/setLocalDescription/exchange SDP...

await agent.startListening();
```

`getTrack()` is only available after `output.initialize()` (which `agent.initialize()` calls for you), because the track is produced by an `AudioContext` destination node created at initialization time.

## Configuration options

### WebRTCInput

| Option             | Type                | Default | Description                                                                 |
| ------------------ | ------------------- | ------- | --------------------------------------------------------------------------- |
| `track`            | `MediaStreamTrack`  | --      | Remote audio track to consume; can also be set later with `setTrack()`      |
| `stream`           | `MediaStream`       | --      | Remote stream to consume (first audio track mix); `track` wins if both set  |
| `targetSampleRate` | `number`            | `16000` | Sample rate (Hz) of the linear16 PCM emitted to the pipeline                |
| `debug`            | `boolean`           | `false` | Enable debug logging                                                        |

Extra methods: `setTrack(track)` and `setStream(stream)` swap the source at any time -- including mid-capture -- without restarting the pipeline (useful when the active speaker changes or a reconnect produces a fresh track).

### WebRTCOutput

| Option       | Type      | Default         | Description                                                                     |
| ------------ | --------- | --------------- | ------------------------------------------------------------------------------- |
| `sampleRate` | `number`  | browser default | `AudioContext` rate; `48000` matches WebRTC's Opus transport and avoids a resample |
| `debug`      | `boolean` | `false`         | Enable debug logging                                                            |

Extra methods: `getTrack()` returns the agent's audio `MediaStreamTrack`; `getStream()` returns the containing `MediaStream`. Both throw if called before `initialize()`.

## Using with LiveKit (or any SFU)

The same pattern works with any SFU SDK -- subscribe to a remote audio track, hand it to `WebRTCInput`, and publish `WebRTCOutput`'s track. A LiveKit sketch:

```typescript
import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room();
await room.connect(LIVEKIT_URL, token);

// Remote participant speech -> pipeline
room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === Track.Kind.Audio && track.mediaStreamTrack) {
    input.setTrack(track.mediaStreamTrack);
  }
});

// Agent voice -> the room
await room.localParticipant.publishTrack(output.getTrack(), {
  name: 'agent-voice',
  source: Track.Source.Microphone,
});
```

With Daily, use `callObject.on('track-started', ...)` for the input side and `callObject.setInputDevicesAsync({ audioSource: output.getTrack() })` (or a custom track publish) for the output side. For a raw `RTCPeerConnection`, use `pc.ontrack` and `pc.addTrack` as in the basic setup.

## Audio formats

**Input.** `WebRTCInput` always emits mono linear16 PCM at `targetSampleRate` (default 16 kHz) and reports that via `getMetadata()`, so live STT providers are auto-configured -- the browser has already decoded the incoming Opus for you. If the `AudioContext` cannot run at the target rate, audio is downsampled before emission.

**Output.** `configure(metadata)` (called automatically when the TTS emits metadata) tells the provider how to decode chunks:

| TTS encoding      | Handling                                                                     |
| ----------------- | ---------------------------------------------------------------------------- |
| `linear16`        | Decoded directly -- recommended for streaming TTS                             |
| `mulaw` / `alaw`  | G.711-decoded to linear16 using the SDK's built-in codecs                     |
| `mp3` / `opus`    | Browser `decodeAudioData()` -- requires complete frames/containers            |

Streamed `mp3` fragments that split frames may fail to decode chunk-by-chunk. If you see decode errors, configure your TTS for raw PCM, e.g. `DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })`. Chunks are scheduled gaplessly on the `AudioContext` timeline, so consecutive TTS chunks play back-to-back without clicks; the Web Audio API resamples buffers to the context rate automatically.

## Limitations

- **Browser only.** Both providers need `AudioContext` (and `MediaStream` for input). For server-side WebRTC agents, terminate the media on a server (e.g. an SFU egress) and use `BufferInput` instead.
- **One source at a time.** `WebRTCInput` consumes a single track/stream. To transcribe several participants at once, either hand it a server-mixed track or swap sources with `setTrack()` on active-speaker changes.
- **The app owns lifecycles.** `WebRTCInput` never stops your track; `WebRTCOutput.dispose()` closes its `AudioContext`, which ends the published track -- re-publish a fresh `getTrack()` if you re-initialize.
- `stop()` on the output is barge-in: all scheduled audio is halted and cleared immediately (remote listeners hear the agent cut off, which is the desired interruption behavior).

## Troubleshooting

**No audio reaches the STT.** Check that `setTrack()`/`setStream()` was actually called (e.g. your `ontrack`/`TrackSubscribed` handler fired) and that the provider was started (`agent.startListening()`). A muted remote track produces silence, not an error.

**`getTrack()` throws `InvalidStateError`.** Call it after `agent.initialize()` (or `output.initialize()`); the destination track does not exist before then.

**Remote peers hear nothing from the agent.** Ensure the track was added to the connection *before* the offer/answer exchange (or renegotiate after `addTrack`). Also check the page satisfied the browser's autoplay policy -- an `AudioContext` created without a user gesture may start suspended; resume it after a click, or create the agent in a user-gesture handler.

**Decode errors on TTS chunks.** You are likely streaming `mp3` fragments. Switch the TTS to `linear16` (see [Audio formats](#audio-formats)); the error message names the offending encoding.

**Choppy or robotic agent audio.** Match `WebRTCOutput`'s `sampleRate` to 48000 so the browser does not resample twice, and prefer a TTS rate of 24000 or 48000.

**The agent transcribes itself.** If the same page also plays the agent's voice locally, the remote side's echo cancellation does not apply. Pause the input during playback (the pipeline's turn-taking does this automatically) or keep playback remote-only.
