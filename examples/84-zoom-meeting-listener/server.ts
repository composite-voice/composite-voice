/**
 * Example 84: Zoom meeting listener.
 *
 * A plain node:http webhook server that streams live Zoom meeting audio
 * into the pipeline via Realtime Media Streams (RTMS), logs the running
 * transcript, and prints an LLM-written summary when the meeting ends.
 *
 *   meeting.rtms_started webhook → agent.startListening({ meetingUuid,
 *                                    rtmsStreamId, serverUrl })
 *   meeting audio (L16 @ 16 kHz) → ZoomRtmsInput → SpeechmaticsSTT → console
 *   meeting.rtms_stopped webhook → zoom.disconnect() → Claude summarizes
 *                                    the collected transcript
 *
 * RTMS is receive-only — nothing can be played back into the meeting —
 * so the 'tts' + 'output' roles are covered by NullOutput.
 *
 * Run with:
 *   PORT=3084 node --env-file=.env --import tsx/esm server.ts
 */

import http from 'node:http';
import { createHmac } from 'node:crypto';
import {
  CompositeVoice,
  ZoomRtmsInput,
  SpeechmaticsSTT,
  AnthropicLLM,
  NullOutput,
} from 'composite-voice';

const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_SECRET_TOKEN, SPEECHMATICS_API_KEY, ANTHROPIC_API_KEY } =
  process.env;
const PORT = Number(process.env.PORT ?? 3084);

if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !ZOOM_SECRET_TOKEN || !SPEECHMATICS_API_KEY || !ANTHROPIC_API_KEY) {
  console.error('Missing env vars. Copy sample.env to .env and fill in every value.');
  process.exit(1);
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

const zoom = new ZoomRtmsInput({
  clientId: ZOOM_CLIENT_ID,
  clientSecret: ZOOM_CLIENT_SECRET,
  sampleRate: 16000, // L16 mono — what most streaming STT providers want
  dataOpt: 'mixed', // one stream with all participants mixed
});

const agent = new CompositeVoice({
  providers: [
    zoom, // input only — RTMS is receive-only

    // ZoomRtmsInput reports linear16 @ 16 kHz mono via getMetadata(). Auto
    // configuration only covers Deepgram-shaped configs, so state the format
    // Speechmatics should expect.
    new SpeechmaticsSTT({
      apiKey: SPEECHMATICS_API_KEY,
      audioFormat: 'pcm_s16le',
      sampleRate: 16000,
    }),

    // The 'llm' role is mandatory. During the meeting it acknowledges each
    // utterance with a single word (kept out of the logs); at the end it
    // writes the real summary.
    new AnthropicLLM({
      apiKey: ANTHROPIC_API_KEY,
      model: 'claude-haiku-4-5',
      systemPrompt:
        'You are a silent meeting listener. While a meeting is in progress you ' +
        "receive individual utterances — reply to those with only the word 'Noted.'. " +
        'When you are finally given a full transcript and asked to summarize, produce ' +
        'a concise summary: 2-4 sentence overview, key points, and any action items.',
    }),

    // Covers both 'tts' and 'output' roles: no audio goes back to Zoom.
    new NullOutput(),
  ],
});

// ── Meeting state ────────────────────────────────────────────────────────────

let transcriptLines: string[] = [];
let awaitingSummary = false;

agent.on('transcription.final', ({ text }) => {
  transcriptLines.push(text);
  console.log(`[transcript] ${text}`);
});

agent.on('llm.complete', ({ text }) => {
  // Ignore the per-utterance 'Noted.' acknowledgments; only print the
  // end-of-meeting summary.
  if (awaitingSummary) {
    awaitingSummary = false;
    console.log('\n===== MEETING SUMMARY =====\n');
    console.log(text);
    console.log('\n===========================\n');
  }
});

agent.on('agent.error', ({ error, context }) => {
  console.error(`[error] ${context ?? 'agent'}:`, error.message);
});

interface RtmsStartedObject {
  meeting_uuid: string;
  rtms_stream_id: string;
  server_urls: string;
}

async function onMeetingStarted(payload: RtmsStartedObject): Promise<void> {
  transcriptLines = [];
  console.log(`[zoom] RTMS started for meeting ${payload.meeting_uuid} — connecting...`);

  // startListening() accepts the RTMS session directly (equivalent to
  // zoom.connect(session) followed by startListening()). Pass the webhook
  // values through verbatim — meeting UUIDs contain special characters and
  // must not be re-encoded, or the HMAC signature will not match.
  await agent.startListening({
    meetingUuid: payload.meeting_uuid,
    rtmsStreamId: payload.rtms_stream_id,
    serverUrl: payload.server_urls,
  });

  console.log('[zoom] Connected. Live transcript follows.');
}

async function onMeetingStopped(): Promise<void> {
  console.log('[zoom] RTMS stopped — disconnecting.');
  await zoom.disconnect();
  await agent.stopListening().catch(() => undefined);

  if (transcriptLines.length === 0) {
    console.log('[zoom] No speech was transcribed; skipping summary.');
    return;
  }

  awaitingSummary = true;
  await agent.sendMessage(
    'The meeting has ended. Summarize this transcript:\n\n' + transcriptLines.join('\n')
  );
}

// ── Webhook server ───────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url?.split('?')[0] !== '/zoom/webhook') {
    res.writeHead(404).end('Not found');
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk));
  req.on('end', () => {
    let event: string;
    let payload: Record<string, unknown>;
    try {
      ({ event, payload } = JSON.parse(body));
    } catch {
      res.writeHead(400).end('Invalid JSON');
      return;
    }

    // Zoom's endpoint URL validation challenge: echo plainToken alongside
    // its HMAC-SHA256 (hex), keyed with the app's webhook Secret Token.
    if (event === 'endpoint.url_validation') {
      const plainToken = (payload as { plainToken: string }).plainToken;
      const encryptedToken = createHmac('sha256', ZOOM_SECRET_TOKEN).update(plainToken).digest('hex');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ plainToken, encryptedToken }));
      console.log('[zoom] Answered URL-validation challenge.');
      return;
    }

    // Acknowledge immediately (Zoom retries slow endpoints), then act.
    res.writeHead(200).end('OK');

    const object = (payload as { object?: RtmsStartedObject } | undefined)?.object;

    if (event === 'meeting.rtms_started' && object) {
      void onMeetingStarted(object).catch((err) => console.error('[zoom] connect failed:', err));
    }

    if (event === 'meeting.rtms_stopped') {
      void onMeetingStopped().catch((err) => console.error('[zoom] cleanup failed:', err));
    }
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

await agent.initialize();

server.listen(PORT, () => {
  console.log(`Zoom meeting listener running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/zoom/webhook`);
  console.log(`Expose it with:   ngrok http ${PORT}\n`);
  console.log('Waiting for a meeting.rtms_started webhook...');
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  void agent.dispose().finally(() => process.exit(0));
});
