# Example 87 — Teams Meeting Agent

Put a voice agent **inside a Microsoft Teams meeting**. `TeamsCall` joins as an external participant via the Azure Communication Services (ACS) calling SDK — a duplex provider filling both the `input` and `output` roles: it hears the meeting's mixed audio and speaks Claude's replies back into the call.

| | Provider | Notes |
|-|----------|-------|
| **Input + Output** | `TeamsCall` | ACS Teams interop; duplex (one instance, two roles) |
| **STT** | `SpeechmaticsSTT` | `pcm_s16le` @ 16000 Hz, matching the input metadata |
| **LLM** | `AnthropicLLM` | Claude Haiku, brief conversational replies |
| **TTS** | `SpeechifyTTS` | REST synthesis returning one complete MP3 per utterance, which `TeamsCall` decodes with `decodeAudioData` |

## What you'll learn

- Joining a Teams meeting with `TeamsCall` (ACS token + meeting join link) — `agent.initialize()` performs the join
- Surfacing the call lifecycle via `onCallStateChanged()` — especially the **`InLobby`** state, where no audio flows until a participant admits the agent
- A duplex provider in practice: `stop()` is barge-in for the agent's speech, `pause()`/`resume()` gate input during turn-taking
- Why the ACS peer dependencies (`@azure/communication-calling`, `@azure/communication-common`) live in the example's `package.json` — the SDK imports them dynamically at `initialize()` time

## Prerequisites

1. **Speechmatics + Speechify + Anthropic keys** in the root `.env` (see Setup).
2. **An Azure Communication Services resource** in your Azure subscription.
3. **An ACS user access token** with the `voip` scope (issued from that resource).
4. **A Teams meeting join link** (`https://teams.microsoft.com/l/meetup-join/...`) from an Outlook/Teams invite. The meeting's tenant must allow anonymous/external join.

No Teams license is needed for the agent itself; standard ACS calling rates apply.

### Creating the ACS resource and issuing a token (az CLI)

```bash
# One-time: create the resource and grab its connection string
az communication create \
  --name my-voice-agent-comms \
  --resource-group my-rg \
  --location global \
  --data-location UnitedStates

az communication list-key \
  --name my-voice-agent-comms \
  --resource-group my-rg

# Per session: mint a user + voip-scoped access token
az extension add --name communication  # first time only
az communication identity token issue \
  --scope voip \
  --connection-string "<primary connection string>"
# → copy the "token" value into the UI
```

(Newer CLI versions expose the same command as `az communication user-identity token issue`.) Tokens expire after 24 hours by default. In production, issue them from a small server endpoint with the [Identity SDK](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/identity/access-tokens) — never ship your connection string to the browser; pasting a short-lived token into a dev UI is fine, embedding the ability to mint them is not.

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Add your keys to the root .env
cp examples/87-teams-meeting-agent/sample.env .env
# Edit .env and set SPEECHMATICS_API_KEY, SPEECHIFY_API_KEY and ANTHROPIC_API_KEY
```

`pnpm install` also pulls this example's ACS dependencies (`@azure/communication-calling`, `@azure/communication-common`).

## Run

```bash
pnpm --filter composite-voice-example-87-teams-meeting-agent dev
```

Open [http://localhost:3087](http://localhost:3087):

1. Create a Teams meeting (any calendar invite works) and join it yourself.
2. Paste the ACS access token and the meeting join link.
3. Click **Join Meeting**.

## What to expect

- **The lobby.** Most tenants send external participants to the lobby: the call badge shows `InLobby` and a banner asks you to admit **"CompositeVoice Agent"** from the Teams participant list. **No audio flows either way until admission.**
- Once `Connected`, everything said in the meeting streams into the **Live Meeting Transcript** card (all speakers pre-mixed).
- After each utterance, Claude's reply streams into the **Agent Reply** card and is **spoken into the meeting** — other participants hear it like any attendee.
- **Leave Meeting** hangs up and disposes the ACS call agent.

## Troubleshooting

- **`@azure/communication-calling is required` at initialize.** Run `pnpm install` at the repo root so the example's ACS dependencies are present.
- **Stuck in `InLobby`.** A participant must admit the agent; check the organizer's "Who can bypass the lobby?" meeting option.
- **Joins then immediately disconnects.** The tenant blocks anonymous join, the meeting link is malformed, or the token is expired / missing the `voip` scope.
- **Agent hears nothing after connecting.** Browsers require a user gesture before an `AudioContext` may run — this example initializes from the Join click, so if you modified the flow keep that pattern. Also confirm participants are unmuted.
- **Agent's speech is silent in the meeting.** Verify the call state is `Connected` (not `InLobby`) and that the TTS is emitting a supported encoding — this example pins `linear16` @ 24000 Hz.
- **Long meetings.** A raw token is resolved once at join. For calls that may outlast it, build an `AzureCommunicationTokenCredential` with a refresh callback and pass it as `tokenCredential` instead of `token`.
