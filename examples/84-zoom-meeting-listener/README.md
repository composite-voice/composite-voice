# Example 84 — Zoom Meeting Listener

A meeting listener built on Zoom's **Realtime Media Streams (RTMS)**: a plain `node:http` webhook server receives `meeting.rtms_started`, streams the live meeting audio into the pipeline, logs the transcript as people speak, and prints a Claude-written summary when the meeting ends.

| Component | Details |
|-----------|---------|
| **Input** | `ZoomRtmsInput` (RTMS WebSocket protocol, receive-only, zero deps) |
| **STT** | `DeepgramSTT` (linear16 @ 16 kHz mono) |
| **LLM** | `AnthropicLLM` (claude-haiku-4-5) — end-of-meeting summary |
| **Output** | `NullOutput` — RTMS cannot play audio back into the meeting |
| **Server** | `http.createServer` webhook on port **3084** (`/zoom/webhook`) |

RTMS is receive-only, so `NullOutput` covers the mandatory `tts` + `output` roles and the agent's value is delivered as text: live `[transcript]` lines during the meeting and a summary at the end.

---

## What you'll learn

- Handling Zoom's `endpoint.url_validation` challenge with nothing but `node:crypto` (HMAC-SHA256 of `plainToken`, keyed with the app's webhook Secret Token)
- Starting a stream from webhook values: `agent.startListening({ meetingUuid, rtmsStreamId, serverUrl })`
- Acknowledging webhooks fast (respond 200 first, connect asynchronously) so Zoom doesn't retry
- Cleaning up on `meeting.rtms_stopped` and turning the collected transcript into a summary with `agent.sendMessage()`

> **Note on the LLM role:** the pipeline requires an LLM, and it runs after every utterance. The system prompt instructs it to answer live utterances with just `Noted.` (which the example doesn't print); the real summary is requested once, at meeting end, from the full transcript.

---

## Prerequisites

- **Node.js 21+** (22 LTS recommended — RTMS and Deepgram both use the global `WebSocket`)
- **ngrok** (or any HTTPS tunnel) — Zoom must reach your webhook over public HTTPS
- A [Deepgram API key](https://console.deepgram.com/) and an [Anthropic API key](https://console.anthropic.com/)
- A **Zoom account with RTMS access** (RTMS requires Zoom Developer Pack credits) and a **General app** from the [Zoom App Marketplace](https://marketplace.zoom.us):
  1. In the app's **Features**, enable **Realtime Media Streams** and add the meeting RTMS scopes (`rtms:read:rtms_started`, `rtms:read:rtms_stopped`).
  2. Copy the app's **Client ID** and **Client Secret** (App Credentials page) and the webhook **Secret Token** (Features page).
  3. Add an **Event Subscription** for `meeting.rtms_started` and `meeting.rtms_stopped` — the endpoint URL comes from ngrok below.
  4. Install/authorize the app on the account whose meetings you want to stream.

---

## Setup

```bash
pnpm install && pnpm build   # from the repo root
cp examples/84-zoom-meeting-listener/sample.env examples/84-zoom-meeting-listener/.env
```

Fill in the credentials in `.env`.

---

## Run

**1. Start the server:**

```bash
cd examples/84-zoom-meeting-listener
pnpm start
```

**2. Tunnel it:**

```bash
ngrok http 3084
```

**3. Register the webhook.** In your Zoom app's **Event Subscriptions**, set the endpoint URL to:

```
https://<your-subdomain>.ngrok.app/zoom/webhook
```

Click **Validate** — Zoom sends the `endpoint.url_validation` challenge and the console logs `Answered URL-validation challenge.` (If validation fails, `ZOOM_SECRET_TOKEN` doesn't match the app.)

**4. Start a meeting** on the authorized account (with RTMS auto-start enabled, or start RTMS on demand) and talk:

```
[zoom] RTMS started for meeting abc123== — connecting...
[zoom] Connected. Live transcript follows.
[transcript] okay let's get started with the roadmap review
[transcript] the launch is moving to the second week of March
...
```

**5. End the meeting** — the `meeting.rtms_stopped` webhook triggers cleanup and the summary:

```
[zoom] RTMS stopped — disconnecting.

===== MEETING SUMMARY =====

The team reviewed the Q2 roadmap and agreed to move the launch...
Action items:
- ...

===========================
```

Each new meeting resets the transcript; the server keeps running between meetings. Note the provider handles one stream at a time — for simultaneous meetings, create one pipeline per meeting.

---

## Production hardening

- **Verify webhook signatures.** Zoom signs every event with the same Secret Token (`x-zm-signature: v0=HMAC-SHA256("v0:{x-zm-request-timestamp}:{body}")`). This example skips verification for brevity — add it before exposing the endpoint beyond a demo.
- **Free ngrok URLs rotate** on restart; re-validate the endpoint in the Zoom app each time, or use a reserved domain.

---

## Troubleshooting

- **Endpoint validation fails** — the `ZOOM_SECRET_TOKEN` is not the one from *this* app's Features page, or the tunnel isn't pointing at port 3084.
- **`meeting.rtms_started` never arrives** — check the event subscription includes both RTMS events, the endpoint passed validation, RTMS is enabled in the app's Features, and the app is authorized on the meeting host's account.
- **`STATUS_INVALID_SIGNATURE` on connect** — `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET` don't belong to the app that has RTMS enabled (or were regenerated). Note the *webhook* Secret Token is a different value from the Client Secret.
- **`STATUS_INVALID_RTMS_STREAM_ID`** — the stream already ended, or a stale webhook was replayed. Webhook-delivered URLs are meant to be used right away.
- **Connected but no `[transcript]` lines** — participants are muted, or the meeting has no speech yet. Also confirm Deepgram accepted the connection (watch for `[error]` lines).
- **No summary at the end** — the summary is skipped when nothing was transcribed; otherwise check for `[error]` lines from the LLM (invalid `ANTHROPIC_API_KEY`).

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [83 — Discord Voice Bot](../83-discord-voice-bot/) | Live duplex conversation in a voice channel |
| [53 — Null Output](../53-null-output/) | The output-discarding provider used here |
