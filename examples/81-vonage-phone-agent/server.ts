/**
 * Example 81: Vonage phone agent — Voice API WebSockets + CompositeVoice.
 *
 * A caller dials your Vonage number, Vonage fetches an NCCO from GET /answer,
 * then bridges the call to wss://<host>/audio as raw linear16 PCM. Each
 * connection gets its own CompositeVoice pipeline:
 *
 *   VonageAudioSocket (duplex, linear16 @ 16 kHz) — caller audio in, agent audio out
 *   SpeechmaticsSTT (pcm_s16le / 16000)           — wideband transcription
 *   AnthropicLLM    (claude-haiku-4-5)            — fast conversational replies
 *   DeepgramTTS     (linear16 / 16000)            — matches the NCCO rate, passthrough
 *
 * Vonage WebSockets carry raw linear16 only, so the TTS stage stays on a
 * streaming provider that emits PCM. SpeechifyTTS returns a complete MP3 over
 * REST, which VonageAudioSocket cannot decode.
 *
 * Run with:
 *   node --env-file=.env --import tsx/esm server.ts
 *
 * Expose it with `ngrok http 3081` and set your Vonage application's answer
 * URL to https://<your-ngrok-domain>/answer and event URL to
 * https://<your-ngrok-domain>/event.
 */

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CompositeVoice,
  VonageAudioSocket,
  SpeechmaticsSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';


const PORT = Number(process.env.PORT ?? 3081);

// Keep the NCCO content-type, the STT sample rate, and the TTS sample rate
// aligned — a mismatch produces garbled or slowed/sped-up audio.
const SAMPLE_RATE = 16000;

// ── Startup checks ───────────────────────────────────────────────────────────

for (const key of ['SPEECHMATICS_API_KEY', 'DEEPGRAM_API_KEY', 'ANTHROPIC_API_KEY'] as const) {
  if (!process.env[key]) {
    console.error(`Missing ${key} — copy sample.env to .env and fill in your keys.`);
    process.exit(1);
  }
}

// ── HTTP server: answer + event webhooks ─────────────────────────────────────
//
// GET /answer returns the NCCO (Nexmo Call Control Object). The `connect`
// action with a `websocket` endpoint bridges the caller to this same server;
// the `Host` header is the public (ngrok) hostname, so the wss:// URI always
// points back here. GET/POST /event is a 200 sink for call status webhooks —
// Vonage requires the URL to exist, but this example does not act on events.

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (path === '/answer') {
    const host = req.headers.host ?? `localhost:${PORT}`;
    const ncco = [
      {
        action: 'connect',
        endpoint: [
          {
            type: 'websocket',
            uri: `wss://${host}/audio`,
            'content-type': `audio/l16;rate=${SAMPLE_RATE}`,
          },
        ],
      },
    ];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ncco));
    return;
  }

  if (path === '/event') {
    // Status sink — accepts GET or POST depending on your application config.
    res.writeHead(200);
    res.end();
    return;
  }

  if (path === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

// ── WebSocket server: one voice pipeline per call ────────────────────────────

const wss = new WebSocketServer({ server, path: '/audio' });
let nextCallId = 1;

wss.on('connection', (socket) => {
  const callId = nextCallId++;
  handleCall(callId, socket).catch((error: unknown) => {
    console.error(`[call ${callId}] Failed to start pipeline:`, error);
    socket.close();
  });
});

async function handleCall(callId: number, socket: WebSocket): Promise<void> {
  const log = (message: string) => console.log(`[call ${callId}] ${message}`);
  log('Vonage connected');

  // One provider set per call — never share pipeline instances between calls.
  const vonage = new VonageAudioSocket();

  const agent = new CompositeVoice({
    providers: [
      vonage, // duplex: fills both the input and output roles
      new SpeechmaticsSTT({
        apiKey: process.env.SPEECHMATICS_API_KEY,
        audioFormat: 'pcm_s16le',
        sampleRate: SAMPLE_RATE,
      }),
      new AnthropicLLM({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-haiku-4-5',
        maxTokens: 300,
        systemPrompt:
          'You are a friendly phone agent. You are on a live phone call, so keep ' +
          'replies short, conversational, and free of markdown or lists.',
      }),
      new DeepgramTTS({
        apiKey: process.env.DEEPGRAM_API_KEY,
        options: { encoding: 'linear16', sampleRate: SAMPLE_RATE },
      }),
    ],
  });

  // Console transcript of the conversation.
  agent.on('transcription.final', (event) => log(`Caller: ${event.text}`));
  agent.on('llm.complete', (event) => log(`Agent:  ${event.text}`));
  agent.on('agent.error', (event) =>
    log(`Error (${event.recoverable ? 'recoverable' : 'fatal'}): ${event.error.message}`)
  );

  vonage.onDtmf((digit, duration) =>
    log(`Keypad: ${digit}${duration ? ` (${duration} ms)` : ''}`)
  );

  // Vonage has no explicit call-ended message — the socket closing IS the
  // hangup signal. Tear down exactly once.
  let disposed = false;
  socket.on('close', () => {
    if (disposed) return;
    disposed = true;
    log('Call ended (socket closed) — disposing pipeline');
    void agent.dispose();
  });

  await agent.initialize();
  await agent.startListening(socket); // attaches the socket and starts capture

  log(`Listening — negotiated ${vonage.getContentType() ?? `audio/l16;rate=${SAMPLE_RATE} (pending)`}`);
}

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Vonage phone agent running on http://localhost:${PORT}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. ngrok http ${PORT}`);
  console.log('  2. In your Vonage application set:');
  console.log('       Answer URL:  https://<your-ngrok-domain>/answer   (GET)');
  console.log('       Event URL:   https://<your-ngrok-domain>/event');
  console.log('  3. Call your Vonage number and start talking.');
});
