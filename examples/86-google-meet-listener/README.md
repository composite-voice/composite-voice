# Example 86 — Google Meet Listener

Join a live Google Meet conference as a **listener** and stream its mixed audio into the pipeline. `GoogleMeetInput` connects over WebRTC via the Google Meet Media API — no platform SDK, just `RTCPeerConnection` + `fetch`. Deepgram transcribes the meeting live and Claude turns each utterance into a running list of meeting notes.

> **Developer Preview.** The Meet Media API requires your Google Cloud project to be enrolled in the [Google Workspace Developer Preview Program](https://developers.google.com/workspace/preview), **and every participant in the conference must belong to an enrolled account**. Non-enrolled projects get `PERMISSION_DENIED`. Expect breaking changes until GA.

| | Provider | Notes |
|-|----------|-------|
| **Input** | `GoogleMeetInput` | Meet Media API over WebRTC; emits linear16 @ 16000 Hz mono |
| **STT** | `DeepgramSTT` | Auto-configured from the input metadata |
| **LLM** | `AnthropicLLM` | Claude Haiku as a silent note-taker |
| **TTS + Output** | `NullOutput` | Meet Media API is **receive-only** — the agent cannot speak into the call |

## What you'll learn

- Joining a Meet conference with `GoogleMeetInput` (OAuth token + `spaces/{id}`)
- Tracking the session lifecycle via `onSessionStatus()` (`STATE_WAITING` → `STATE_JOINED` → `STATE_DISCONNECTED`)
- Resolving a meeting code to a space name with the Meet REST API `spaces.get`
- A listen-only pipeline: `NullOutput` covers both the `tts` and `output` roles, so LLM text still streams via events without being synthesized

## Prerequisites

1. **Deepgram + Anthropic keys** in the root `.env` (see Setup).
2. **A Developer Preview–enrolled Google Cloud project** with the **Google Meet Media API** (and Google Meet REST API, for the space lookup) enabled.
3. **An OAuth access token** with the scope `https://www.googleapis.com/auth/meetings.conference.media.audio.readonly` (or the broader `.media.readonly`).
4. **An active conference** — someone must already be in the meeting when you click Join.

### Getting an access token (OAuth Playground trick)

The quickest way to mint a token by hand:

1. In your enrolled project, create an **OAuth client ID** (type: Web application) and add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
2. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), click the gear icon, tick **Use your own OAuth credentials**, and paste your client ID + secret. (The playground's default credentials cannot authorize Developer Preview scopes.)
3. In Step 1, enter the scope `https://www.googleapis.com/auth/meetings.conference.media.audio.readonly` and authorize with an account in the enrolled Workspace.
4. In Step 2, click **Exchange authorization code for tokens** and copy the **access token**.

Access tokens live about an hour. The provider only uses the token once, at connect time, so an established session survives expiry — but rejoin attempts need a fresh token.

### Resolving the space name

`GoogleMeetInput` wants the space **resource name** (`spaces/{id}`), not the meeting code from the URL. This example has a built-in **Resolve** button that calls `spaces.get` for you, or do it yourself:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://meet.googleapis.com/v2/spaces/abc-mnop-xyz
# → { "name": "spaces/jQCFfuBOdN5z", ..., "activeConference": { ... } }
```

`activeConference` must be present — the connect call fails when nobody is in the meeting.

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Add your keys to the root .env
cp examples/86-google-meet-listener/sample.env .env
# Edit .env and set DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-86-google-meet-listener dev
```

Open [http://localhost:3086](http://localhost:3086):

1. Start a Google Meet call from an enrolled account (and stay in it).
2. Paste your OAuth access token.
3. Paste the meeting code and click **Resolve** (or paste the `spaces/{id}` name directly).
4. Click **Join Meeting**.

## What to expect

- The session badge moves to **waiting for admission** and then **in the meeting** (Meet may auto-admit the media session, depending on the host's settings).
- Everything said in the meeting appears in the **Live Meeting Transcript** card (interim results in italics). All speakers arrive pre-mixed — per-speaker separation is not available.
- After each utterance, Claude appends a timestamped note (decision, action item, or key point) to **Meeting Notes**. Unremarkable chatter is skipped.
- Leaving sends the Meet `leave` request and tears down the WebRTC session.

## Troubleshooting

- **`PERMISSION_DENIED` on join.** Your project (or a participant's account) is not Developer Preview–enrolled, or the token lacks the media-audio scope.
- **`FAILED_PRECONDITION` / "no answer" on join.** No active conference in the space — someone must be in the meeting first. Use Resolve and check the warning about `activeConference`.
- **Stuck at "waiting for admission".** The media session is pending admission to the meeting; a host may need to allow it.
- **Token expired.** Mint a fresh one in the OAuth Playground (Step 2 has a refresh button if you kept the tab open).
- **No notes appearing.** Notes only appear when Claude judges an utterance noteworthy; check the transcript card is moving first, and the browser console for `agent.error` events.
- **Agent replies are not heard in the meeting.** Expected — the Meet Media API is receive-only, which is why this pipeline uses `NullOutput`.
