/**
 * Example 83: Discord voice bot.
 *
 * Joins a configured guild voice channel at startup and holds a live,
 * interruptible conversation with the people in it:
 *
 *   speakers      → DiscordVoice   (Opus decoded to 48 kHz mono PCM
 *                                    via prism-media)
 *                 → SpeechmaticsSTT (pcm_s16le @ 48 kHz)
 *                 → AnthropicLLM   (claude-haiku-4-5)
 *                 → DeepgramTTS    (linear16 @ 24 kHz — DiscordVoice
 *                                    resamples to 48 kHz stereo itself,
 *                                    so no ffmpeg is needed)
 *   voice channel ← DiscordVoice   (AudioPlayer, raw PCM)
 *
 * Your app owns the discord.js client and joins the channel; the provider
 * only needs the resulting VoiceConnection, passed to startListening().
 *
 * Run with:
 *   node --env-file=.env --import tsx/esm server.ts
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import {
  CompositeVoice,
  DiscordVoice,
  SpeechmaticsSTT,
  AnthropicLLM,
  DeepgramTTS,
} from 'composite-voice';

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_CHANNEL_ID,
  SPEECHMATICS_API_KEY,
  DEEPGRAM_API_KEY,
  ANTHROPIC_API_KEY,
} = process.env;

if (
  !DISCORD_BOT_TOKEN ||
  !DISCORD_GUILD_ID ||
  !DISCORD_CHANNEL_ID ||
  !SPEECHMATICS_API_KEY ||
  !DEEPGRAM_API_KEY ||
  !ANTHROPIC_API_KEY
) {
  console.error('Missing env vars. Copy sample.env to .env and fill in every value.');
  process.exit(1);
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

const discord = new DiscordVoice({
  // Milliseconds of silence that end a user's utterance. Lower = snappier
  // turn-taking, higher = fewer mid-sentence cutoffs.
  silenceDurationMs: 1000,
  // Tip: in busy channels, set `userId: '<discord-user-id>'` to lock capture
  // to a single speaker — simultaneous speakers interleave and garble STT.
});

const agent = new CompositeVoice({
  providers: [
    discord, // duplex: covers 'input' + 'output'

    // DiscordVoice emits 48 kHz mono linear16 PCM (Opus decoded + downmixed).
    //
    // `endOfUtteranceSilenceTrigger` is what completes a turn: without it
    // Speechmatics never marks the utterance complete and the agent never
    // replies. Discord sends no packets between utterances, so DiscordVoice
    // emits a short silence tail when a speaker stops; this is the threshold
    // that acts on it. It must stay below `maxDelay` (1 s by default).
    new SpeechmaticsSTT({
      apiKey: SPEECHMATICS_API_KEY,
      audioFormat: 'pcm_s16le',
      sampleRate: 48000,
      endOfUtteranceSilenceTrigger: 0.6,
    }),

    new AnthropicLLM({
      apiKey: ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5',
      systemPrompt:
        'You are a helpful voice assistant in a Discord voice channel. ' +
        'Keep responses short and conversational — one or two sentences.',
    }),

    // Raw PCM only: DiscordVoice rejects compressed TTS formats (mp3/opus)
    // because decoding them server-side would need ffmpeg — which rules out
    // SpeechifyTTS, whose REST API returns a complete MP3. 24 kHz mono
    // upsamples cleanly to Discord's native 48 kHz stereo.
    new DeepgramTTS({
      apiKey: DEEPGRAM_API_KEY,
      options: { encoding: 'linear16', sampleRate: 24000 },
    }),
  ],
  conversationHistory: { enabled: true, maxTurns: 10 },
});

// ── Console logging ──────────────────────────────────────────────────────────

agent.on('transcription.final', ({ text }) => {
  console.log(`[user]      ${text}`);
});

agent.on('llm.complete', ({ text }) => {
  console.log(`[assistant] ${text}`);
});

agent.on('agent.error', ({ error, context }) => {
  console.error(`[error]     ${context ?? 'agent'}:`, error.message);
});

// ── Discord client ───────────────────────────────────────────────────────────

// GuildVoiceStates is required or the voice connection never becomes ready.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

async function joinAndListen(): Promise<void> {
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  const channel = await guild.channels.fetch(DISCORD_CHANNEL_ID);

  if (!channel?.isVoiceBased()) {
    console.error(`Channel ${DISCORD_CHANNEL_ID} is not a voice channel.`);
    process.exit(1);
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false, // REQUIRED — a self-deafened bot receives no audio
  });

  await agent.initialize();
  await agent.startListening(connection);

  console.log(`Listening in #${channel.name}. Speak in the channel; Ctrl+C to stop.`);
}

// On discord.js older than 14.16, use 'ready' instead of 'clientReady'.
// The handler is kept sync so its rejections can't escape as unhandled ones —
// a bad guild or channel id should print the reason, not a stack trace.
client.once('clientReady', () => {
  void joinAndListen().catch((error: unknown) => {
    console.error(`Could not join the voice channel: ${describe(error)}`);
    console.error(
      'Check DISCORD_GUILD_ID and DISCORD_CHANNEL_ID, and that the bot is in that server.'
    );
    process.exit(1);
  });
});

client.login(DISCORD_BOT_TOKEN).catch((error: unknown) => {
  console.error(`Discord login failed: ${describe(error)}`);
  console.error(
    'Check DISCORD_BOT_TOKEN — reset it on the Bot page of the Discord Developer Portal.'
  );
  process.exit(1);
});

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  void agent
    .dispose()
    .catch(() => undefined)
    .finally(() => {
      client.destroy();
      process.exit(0);
    });
});
