# Example 85 — WebRTC Loopback Agent

The flagship "join anything WebRTC" demo — with **zero platform accounts**. Two local `RTCPeerConnection`s are wired directly to each other (a loopback call): your microphone travels over real WebRTC to the pipeline, and the agent's voice travels back over WebRTC to an `<audio>` element. Swap the loopback peer for LiveKit, Daily, or any SFU and the pipeline code stays identical.

| | Provider | Notes |
|-|----------|-------|
| **Input** | `WebRTCInput` | Consumes the remote track from pcB (`startListening(track)`) |
| **STT** | `DeepgramSTT` | Nova via WebSocket proxy, auto-configured to linear16/16000 |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `DeepgramTTS` | Aura, `linear16` @ 24000 Hz (streams cleanly into WebRTC) |
| **Output** | `WebRTCOutput` | Produces a `MediaStreamTrack` published on pcB |

## What you'll learn

- The generic WebRTC pattern: **your app owns the peer connection**, the providers only convert between tracks and audio chunks
- Passing a remote track straight to `agent.startListening(event.track)` — `WebRTCInput` implements `attach()`, so CompositeVoice forwards the target for you
- Publishing the agent's voice with `output.getTrack()` / `output.getStream()` via `pc.addTrack(...)`
- Wiring two local `RTCPeerConnection`s back-to-back (ICE candidates and SDP handed across directly — no signaling server)

## How the audio flows

```
Mic (getUserMedia) ──addTrack──▶ pcA ══WebRTC══▶ pcB ──ontrack──▶ WebRTCInput
                                                                       │
                                                        DeepgramSTT → AnthropicLLM → DeepgramTTS
                                                                       │
<audio> ◀──ontrack── pcA ◀══WebRTC══ pcB ◀──addTrack── WebRTCOutput.getTrack()
```

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Add your keys to the root .env
cp examples/85-webrtc-loopback/sample.env .env
# Edit .env and set DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-85-webrtc-loopback dev
```

Open [http://localhost:3085](http://localhost:3085), click **Start Loopback Call**, grant microphone access, and talk. **Wear headphones** — the agent's voice plays out of your speakers and would otherwise feed back into the mic.

## What to expect

1. Both peer connection badges go `connecting` → `connected` within a second (everything is local; ICE resolves on host candidates).
2. Speak — your words appear in the Live Transcript card (interim results in italics).
3. The agent's reply streams into the Agent Reply card and **plays through the WebRTC loop**: TTS → pcB → pcA → the `<audio>` element.

## Swapping the loopback for LiveKit / Daily

The loopback is stand-in plumbing; `WebRTCInput`/`WebRTCOutput` don't care where the tracks come from. With LiveKit:

```typescript
import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room();
await room.connect(LIVEKIT_URL, token);

// Remote participant speech -> pipeline
room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === Track.Kind.Audio && track.mediaStreamTrack) {
    void agent.startListening(track.mediaStreamTrack);
  }
});

// Agent voice -> the room
await room.localParticipant.publishTrack(output.getTrack(), {
  name: 'agent-voice',
  source: Track.Source.Microphone,
});
```

With Daily, use `callObject.on('track-started', ...)` for the input side and publish `output.getTrack()` as a custom track. For any raw `RTCPeerConnection` (1:1 call, custom SFU), use `pc.ontrack` and `pc.addTrack` exactly as this example does — just move pcB to the other end of a signaling channel.

## Troubleshooting

- **No transcript.** Check the mic permission was granted and the pcB badge reads `connected`. A muted mic produces silence, not an error.
- **No agent audio.** Browsers require a user gesture before audio plays — this example starts everything from the button click, but if you modified the flow, make sure the `<audio>` element (and the providers' `AudioContext`s) are created in a click handler.
- **The agent transcribes itself.** The pipeline pauses input during playback (turn-taking), but speaker → mic echo can still leak in the gaps. Use headphones.
- **Choppy agent audio.** Keep `WebRTCOutput` at `sampleRate: 48000` (matches WebRTC's Opus transport) and the TTS at `linear16`/24000 as configured here.
