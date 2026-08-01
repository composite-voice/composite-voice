# Example 83 — Discord Voice Bot

A bot that joins a Discord voice channel at startup and holds a live conversation with the people in it. `DiscordVoice` is a duplex provider: it decodes each speaker's Opus audio to PCM for STT, and plays TTS replies back through an `AudioPlayer` as raw PCM — **no ffmpeg required**.

| Component | Details |
|-----------|---------|
| **Input/Output** | `DiscordVoice` (`@discordjs/voice` connection, duplex) |
| **STT** | `DeepgramSTT` (linear16 @ 48 kHz — Discord's native rate, downmixed to mono) |
| **LLM** | `AnthropicLLM` (claude-haiku-4-5) |
| **TTS** | `DeepgramTTS` (linear16 @ 24 kHz — the provider resamples to 48 kHz stereo) |
| **Trigger** | Joins `DISCORD_CHANNEL_ID` in `DISCORD_GUILD_ID` on startup |

This is a live stream: barge-in works — speak while the bot is talking and it stops playback and listens.

---

## What you'll learn

- Your app owns the discord.js client and calls `joinVoiceChannel()`; the pipeline just receives the `VoiceConnection` via `agent.startListening(connection)`
- Why `selfDeaf: false` is essential (the default deafens the bot and it hears nothing)
- Why the client needs the `GuildVoiceStates` intent
- Why TTS must be raw PCM (`linear16`) at any rate — `DiscordVoice` resamples 24 kHz mono to Discord's 48 kHz stereo itself, and rejects compressed formats that would need ffmpeg

---

## Prerequisites

- **Node.js 21+** (22 LTS recommended — the SDK's streaming providers use the global `WebSocket`)
- A **Discord application + bot** (see setup below)
- A [Deepgram API key](https://console.deepgram.com/)
- An [Anthropic API key](https://console.anthropic.com/)

### Create the bot and invite it

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. On the **Bot** page, click **Reset Token** and copy it — that's `DISCORD_BOT_TOKEN`. No privileged gateway intents are needed (`GuildVoiceStates` is not privileged).
3. On **OAuth2 → URL Generator**, check the `bot` scope, then the **Connect** and **Speak** permissions. Open the generated URL and invite the bot to your server.
4. In Discord, enable **Developer Mode** (User Settings → Advanced), then right-click your server name → **Copy Server ID** (`DISCORD_GUILD_ID`) and right-click the target voice channel → **Copy Channel ID** (`DISCORD_CHANNEL_ID`).

### Native dependencies

This example's `dependencies` include the voice stack: `discord.js`, `@discordjs/voice`, `prism-media`, and `@discordjs/opus` (a native Opus codec). The bot imports all four at runtime, so they stay out of `devDependencies` — a production install (`npm install --omit=dev`) would otherwise drop them and the bot would fail on its first import. If `@discordjs/opus` fails to build on your machine, swap it for **`opusscript`** — a pure-JS (slower, but dependency-free) codec that `prism-media` picks up automatically:

```bash
pnpm remove @discordjs/opus && pnpm add opusscript
```

Voice encryption uses Node's built-in `aes-256-gcm` on modern Node. If `@discordjs/voice` complains at startup that no encryption package is installed, add one: `pnpm add sodium-native`.

---

## Setup

```bash
pnpm install && pnpm build   # from the repo root
cp examples/83-discord-voice-bot/sample.env examples/83-discord-voice-bot/.env
```

Fill in the token, ids, and API keys in `.env`.

---

## Run

Join the target voice channel in Discord first (so there's someone to talk to), then:

```bash
cd examples/83-discord-voice-bot
pnpm start
```

You should see:

```
Logged in as my-voice-bot#1234
Listening in #general. Speak in the channel; Ctrl+C to stop.
```

Now just talk. After ~1 second of silence (the utterance boundary), your speech is transcribed and answered out loud:

```
[user]      hey can you hear me
[assistant] Loud and clear! What can I do for you?
```

Try interrupting the bot mid-reply — playback stops and it listens to you instead.

---

## Multiple speakers

By default every speaker in the channel is captured, and there is **no mixing** — simultaneous speakers interleave into one stream and can garble transcription. For a one-on-one assistant, pass your Discord user id to the provider:

```typescript
const discord = new DiscordVoice({ silenceDurationMs: 1000, userId: '<your-user-id>' });
```

---

## Troubleshooting

- **Bot joins but never hears anyone** — the two classics: `selfDeaf: false` missing from `joinVoiceChannel()` (the default deafens the bot), or the `GuildVoiceStates` intent missing from the client.
- **`@discordjs/voice is required but not installed`** — install the peer deps: `pnpm add @discordjs/voice prism-media @discordjs/opus` (or `opusscript`).
- **`Cannot play audio as no valid encryption package is installed`** — `pnpm add sodium-native` (or another package listed in the `@discordjs/voice` docs).
- **`DiscordVoice playback requires linear16 PCM`** — your TTS is configured for a compressed format (mp3/opus). Keep `DeepgramTTS` on `encoding: 'linear16'`.
- **Playback sounds like static or chipmunks** — the TTS's declared `sampleRate` doesn't match what it actually emits; the provider trusts `configure()`.
- **Choppy/robotic transcription** — overlapping speakers. Set `userId` (see above).
- **`client.once('clientReady', ...)` never fires** — on discord.js older than 14.16 the event is named `ready`.
- **Nothing plays** — check the bot has the **Speak** permission in that specific channel.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [84 — Zoom Meeting Listener](../84-zoom-meeting-listener/) | Input-only meeting transcription + summary |
| [61 — Barge-in](../61-barge-in/) | How interruption handling works in the pipeline |
