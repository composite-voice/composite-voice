/**
 * Example 80: Twilio phone agent — Media Streams + CompositeVoice.
 *
 * A caller dials your Twilio number, Twilio fetches TwiML from POST /twiml,
 * then opens a WebSocket to wss://<host>/media. Each connection gets its own
 * CompositeVoice pipeline:
 *
 *   TwilioMediaStream (duplex, mulaw 8k)     — caller audio in, agent audio out
 *   SpeechmaticsSTT (mulaw / 8000)           — telephony-grade transcription
 *   AnthropicLLM    (claude-haiku-4-5)       — fast conversational replies
 *   DeepgramTTS     (mulaw / 8000)           — native passthrough, no transcoding
 *
 * Twilio only accepts G.711 mu-law or raw linear16, so the TTS stage stays on
 * a streaming provider that emits raw telephony audio. SpeechifyTTS returns a
 * complete MP3 over REST, which TwilioMediaStream cannot play.
 *
 * Run with:
 *   node --env-file=.env --import tsx/esm server.ts
 *
 * Expose it with `ngrok http 3080` and point your Twilio number's voice
 * webhook at https://<your-ngrok-domain>/twiml (HTTP POST).
 */

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  CompositeVoice,
  TwilioMediaStream,
  SpeechmaticsSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';


const PORT = Number(process.env.PORT ?? 3080);

// ── Startup checks ───────────────────────────────────────────────────────────

for (const key of ['SPEECHMATICS_API_KEY', 'DEEPGRAM_API_KEY', 'ANTHROPIC_API_KEY'] as const) {
  if (!process.env[key]) {
    console.error(`Missing ${key} — copy sample.env to .env and fill in your keys.`);
    process.exit(1);
  }
}

// ── HTTP server: the TwiML webhook ───────────────────────────────────────────
//
// Twilio requests this when a call connects. `<Connect><Stream>` is required
// for bidirectional audio — `<Start><Stream>` is listen-only and the caller
// would hear silence. The `Host` header is the public (ngrok) hostname, so
// the wss:// URL always points back at this same server.

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'POST' && path === '/twiml') {
    const host = req.headers.host ?? `localhost:${PORT}`;
    res.writeHead(200, { 'content-type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media" />
  </Connect>
</Response>`);
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

const wss = new WebSocketServer({ server, path: '/media' });
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
  log('Twilio connected');

  // One provider set per call — never share pipeline instances between calls.
  const twilio = new TwilioMediaStream();

  const agent = new CompositeVoice({
    providers: [
      twilio, // duplex: fills both the input and output roles
      new SpeechmaticsSTT({
        apiKey: process.env.SPEECHMATICS_API_KEY,
        audioFormat: 'mulaw',
        sampleRate: 8000,
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
        options: { encoding: 'mulaw', sampleRate: 8000 },
      }),
    ],
  });

  // Console transcript of the conversation.
  agent.on('transcription.final', (event) => log(`Caller: ${event.text}`));
  agent.on('llm.complete', (event) => log(`Agent:  ${event.text}`));
  agent.on('agent.error', (event) =>
    log(`Error (${event.recoverable ? 'recoverable' : 'fatal'}): ${event.error.message}`)
  );

  twilio.onDtmf((digit) => log(`Keypad: ${digit}`));

  // Tear down exactly once, whether Twilio sends a `stop` event (hangup) or
  // the socket simply closes.
  let disposed = false;
  const teardown = (reason: string) => {
    if (disposed) return;
    disposed = true;
    log(`Call ended (${reason}) — disposing pipeline`);
    void agent.dispose();
  };

  twilio.onCallEnded(() => teardown('caller hung up'));
  socket.on('close', () => teardown('socket closed'));

  await agent.initialize();
  await agent.startListening(socket); // attaches the socket and starts capture

  log(`Listening — callSid ${twilio.getCallSid() ?? '(pending start message)'}`);
}

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`Twilio phone agent running on http://localhost:${PORT}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. ngrok http ${PORT}`);
  console.log('  2. Set your Twilio number\'s voice webhook to:');
  console.log('       https://<your-ngrok-domain>/twiml   (HTTP POST)');
  console.log('  3. Call your Twilio number and start talking.');
});
