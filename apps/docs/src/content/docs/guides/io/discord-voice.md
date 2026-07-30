---
title: DiscordVoice
description: Put your voice agent in a Discord voice channel, capturing speakers through @discordjs/voice and playing TTS replies back as raw PCM.
order: 6
---

Use DiscordVoice when you want a Discord bot that listens and talks in a voice channel. It is a duplex provider covering both the `input` and `output` pipeline roles: speech from users in the channel is decoded from Opus to 48 kHz PCM and fed to your STT provider, and TTS audio is resampled to Discord's native 48 kHz stereo format and played back through an `AudioPlayer` — as raw PCM, so no ffmpeg is needed.

Your application owns the discord.js client and joins the voice channel; the provider only needs the resulting `VoiceConnection`.

## Prerequisites

- A Discord application with a bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- The bot invited to your server with permission to **Connect** and **Speak** in voice channels
- Node.js 18+ (this provider is server-side only — it uses Node streams)

Install the peer dependencies alongside `discord.js`:

```bash
pnpm add discord.js @discordjs/voice prism-media @discordjs/opus
```

- `@discordjs/voice` — voice connections, receiver, and audio player (loaded dynamically at `initialize()`)
- `prism-media` — Opus decoding for received audio (loaded dynamically at `initialize()`)
- `@discordjs/opus` — the native Opus codec `prism-media` uses; `opusscript` (pure JS, slower) works as an alternative

You will also need an encryption package if your environment lacks one; `@discordjs/voice` will tell you at startup (`sodium-native` is the usual choice).

Because playback is fed to the player as `StreamType.Raw` PCM and received audio is decoded with `prism-media` directly, **ffmpeg is not required**.

## Intents

The client must be created with the `GuildVoiceStates` intent (plus `Guilds` for channel access) or the voice connection will never become ready:

```typescript
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
```

## Basic setup

A minimal bot that joins a voice channel and runs the agent:

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import {
  CompositeVoice,
  DiscordVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const discord = new DiscordVoice({ silenceDurationMs: 1000 });

const agent = new CompositeVoice({
  providers: [
    discord, // covers input + output
    new DeepgramSTT({
      apiKey: process.env.DEEPGRAM_API_KEY,
      options: { encoding: 'linear16', sampleRate: 48000 },
    }),
    new AnthropicLLM({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful Discord voice assistant. Keep responses short.',
    }),
    new DeepgramTTS({
      apiKey: process.env.DEEPGRAM_API_KEY,
      options: { encoding: 'linear16', sampleRate: 24000 },
    }),
  ],
});

client.once('clientReady', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID!);
  const channel = await guild.channels.fetch(process.env.VOICE_CHANNEL_ID!);

  const connection = joinVoiceChannel({
    channelId: channel!.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false, // REQUIRED — a self-deafened bot receives no audio
  });



  await agent.initialize();
  await agent.startListening(connection); // attaches the voice connection and starts capture
});

client.login(process.env.DISCORD_BOT_TOKEN);
```

> **`selfDeaf: false` is essential.** `joinVoiceChannel()` deafens the bot by default, which silently disables audio receive. If your bot joins but never hears anyone, check this first.

The connection can also be passed at construction time (`new DiscordVoice({ connection })`) if you join the channel before initializing the pipeline. On older discord.js versions, use the `ready` event instead of `clientReady`.

## Configuration options

| Option              | Type                     | Default | Description                                                                                          |
| ------------------- | ------------------------ | ------- | ---------------------------------------------------------------------------------------------------- |
| `connection`        | `DiscordVoiceConnection` | --      | Voice connection to attach at `initialize()`; alternatively call `attach(connection)` later          |
| `userId`            | `string`                 | --      | Lock capture to one Discord user id; when omitted, every speaker in the channel is captured          |
| `silenceDurationMs` | `number`                 | `1000`  | Milliseconds of silence before a user's receive stream ends (utterance boundary); re-subscribes on the next speaking event |
| `debug`             | `boolean`                | `false` | Enable debug logging                                                                                  |

There is no `apiKey` — authentication lives entirely in your discord.js client. The whole provider config is optional.

## Audio formats

**Input** (`getMetadata()`): `linear16`, 48 000 Hz, mono, 16-bit. Discord delivers Opus at 48 kHz stereo; the provider decodes with `prism-media` (`rate: 48000, channels: 2, frameSize: 960`) and downmixes to mono by averaging each left/right pair. The pipeline auto-configures your STT provider with this format — pick an STT that accepts 48 kHz linear16 (Deepgram, Gladia, AssemblyAI all do).

**Output**: linear16 PCM only, mono or stereo, any sample rate. The provider converts to Discord's required 48 kHz stereo s16le itself:

- linear16 @ 48 kHz stereo — passthrough
- linear16 @ 48 kHz mono — duplicated into both channels
- linear16 at any other rate — linear-interpolation resample to 48 kHz (24 kHz TTS output upsamples cleanly), then mono→stereo

Compressed TTS formats (mp3, opus, mulaw, alaw) are rejected by `configure()` with a `ConfigurationError`, because decoding them server-side would need ffmpeg. Configure your TTS for raw PCM instead, for example `new DeepgramTTS({ options: { encoding: 'linear16', sampleRate: 24000 } })`.

## Speakers and turn-taking

- The provider subscribes to a user's audio when Discord signals they started speaking, and the subscription ends after `silenceDurationMs` of silence — that boundary is what gives your STT clean utterances. The next time the user speaks, a fresh subscription is created automatically.
- With no `userId` configured, **all** speakers are captured. There is no mixing: chunks from simultaneous speakers interleave in one stream, which can garble STT. For one-on-one assistants, set `userId`; for multi-user channels, consider muting the channel socially ("one speaker at a time") or running one pipeline per user.
- Barge-in works: while audio is queued or playing, `stop()` clears the queue and force-stops the player while capture keeps running, so the interrupting user is transcribed. With nothing playing, `stop()` halts capture instead (equivalent to `stopCapture()`); `detach()` and `dispose()` stop both sides unconditionally.

## Troubleshooting

- **Bot joins but hears nothing** — you joined with `selfDeaf: true` (the default). Pass `selfDeaf: false` to `joinVoiceChannel()`. Also confirm the `GuildVoiceStates` intent is enabled on the client.
- **`@discordjs/voice is required but not installed`** — install the peer dependencies: `pnpm add @discordjs/voice prism-media @discordjs/opus`.
- **`Cannot play audio as no valid encryption package is installed`** — install `sodium-native` (or another encryption package listed in the `@discordjs/voice` docs).
- **Opus decode errors on receive** — `prism-media` needs an Opus codec: `@discordjs/opus` (native, fast) or `opusscript` (pure JS).
- **Playback sounds like static or chipmunks** — your TTS metadata does not match its actual output. The provider trusts `configure()`; make sure the TTS's declared `sampleRate`/`channels` are what it really emits.
- **`DiscordVoice playback requires linear16 PCM`** — your TTS is configured for a compressed format. Switch it to `linear16` (any sample rate).
- **Choppy or robotic received audio** — overlapping speakers interleave into one stream. Set `userId` to lock onto a single speaker.
- **Nothing plays** — verify the bot has the **Speak** permission and that the connection reached the `Ready` state before `flush()` runs.
