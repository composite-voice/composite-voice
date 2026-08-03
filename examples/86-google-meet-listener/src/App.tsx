import React, { useCallback, useRef, useState } from 'react';
import {
  CompositeVoice,
  GoogleMeetInput,
  SpeechmaticsSTT,
  AnthropicLLM,
  NullOutput,
} from 'composite-voice';
import type { GoogleMeetSessionStatus } from 'composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  FormField,
  Input,
} from 'composite-voice-ui';

type SessionState = 'disconnected' | 'connecting' | 'STATE_WAITING' | 'STATE_JOINED' | 'STATE_DISCONNECTED';

interface TranscriptEntry {
  id: number;
  text: string;
  isFinal: boolean;
}

interface NoteEntry {
  id: number;
  text: string;
  time: string;
}

const SESSION_COLORS: Record<SessionState, string> = {
  disconnected: 'neutral',
  connecting: 'warning',
  STATE_WAITING: 'warning',
  STATE_JOINED: 'success',
  STATE_DISCONNECTED: 'danger',
};

const SESSION_LABELS: Record<SessionState, string> = {
  disconnected: 'not connected',
  connecting: 'connecting…',
  STATE_WAITING: 'waiting for admission',
  STATE_JOINED: 'in the meeting',
  STATE_DISCONNECTED: 'disconnected',
};

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const entryIdRef = useRef(0);

  const [accessToken, setAccessToken] = useState('');
  const [meetingCode, setMeetingCode] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [session, setSession] = useState<SessionState>('disconnected');
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Optional helper: resolve a meeting code (abc-mnop-xyz) to spaces/{id}
  // via the Meet REST API spaces.get method.
  const handleResolveSpace = useCallback(async () => {
    setError(null);
    setResolving(true);
    try {
      const code = meetingCode.trim();
      const res = await fetch(
        `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`,
        { headers: { Authorization: `Bearer ${accessToken.trim()}` } }
      );
      if (!res.ok) {
        throw new Error(`spaces.get failed (HTTP ${res.status}): ${await res.text()}`);
      }
      const space = (await res.json()) as { name?: string; activeConference?: unknown };
      if (!space.name) throw new Error('spaces.get returned no space name');
      setSpaceName(space.name);
      if (!space.activeConference) {
        setError(
          'Space resolved, but no conference is active. Someone must be in the meeting before you join.'
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }, [accessToken, meetingCode]);

  const handleLeave = useCallback(async () => {
    const agent = agentRef.current;
    agentRef.current = null;
    try {
      await agent?.stopListening();
      await agent?.dispose(); // sends the Meet leave request
    } catch {
      // best-effort teardown
    }
    setJoined(false);
    setSession('disconnected');
  }, []);

  const handleJoin = useCallback(async () => {
    setError(null);
    setDisconnectReason(null);
    setTranscripts([]);
    setNotes([]);
    setSession('connecting');

    try {
      const meet = new GoogleMeetInput({
        apiKey: accessToken.trim(),
        spaceName: spaceName.trim(),
      });

      meet.onSessionStatus((status: GoogleMeetSessionStatus) => {
        setSession(status.connectionState);
        if (status.connectionState === 'STATE_DISCONNECTED') {
          setDisconnectReason(status.disconnectReason ?? 'unknown reason');
          setJoined(false);
        }
      });

      const agent = new CompositeVoice({
        providers: [
          meet,
          new SpeechmaticsSTT({ proxyUrl: `${window.location.origin}/proxy/speechmatics` }),
          new AnthropicLLM({
            proxyUrl: `${window.location.origin}/proxy/anthropic`,
            model: 'claude-haiku-4-5-20251001',
            systemPrompt:
              'You are a silent meeting note-taker listening to utterances from a live Google Meet call. For each utterance, reply with one short plain-text note capturing any decision, action item, or key point. No markdown, no lists. If nothing is noteworthy, reply with exactly: -',
            maxTokens: 100,
          }),
          // The Meet Media API is receive-only — NullOutput covers the
          // tts + output roles so the agent never tries to speak.
          new NullOutput(),
        ],
      });

      agent.on('transcription.interim', (e) => {
        setTranscripts((prev) => [
          ...prev.filter((t) => t.isFinal),
          { id: ++entryIdRef.current, text: e.text, isFinal: false },
        ]);
      });
      agent.on('transcription.final', (e) => {
        setTranscripts((prev) => [
          ...prev.filter((t) => t.isFinal),
          { id: ++entryIdRef.current, text: e.text, isFinal: true },
        ]);
      });
      agent.on('llm.complete', (e) => {
        const text = e.text.trim();
        if (!text || text === '-') return; // nothing noteworthy this turn
        setNotes((prev) => [
          ...prev,
          {
            id: ++entryIdRef.current,
            text,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      });
      agent.on('agent.error', (e) => setError(e.error.message));

      await agent.initialize(); // joins the active conference
      agentRef.current = agent;
      await agent.startListening();
      setJoined(true);
    } catch (e) {
      setError((e as Error).message);
      setSession('disconnected');
      await handleLeave();
    }
  }, [accessToken, spaceName, handleLeave]);

  return (
    <ExampleShell
      title="Google Meet Listener"
      description="GoogleMeetInput joins a live Google Meet conference over WebRTC (Meet Media API, Developer Preview) and streams the mixed meeting audio into SpeechmaticsSTT. Receive-only: the agent listens and takes notes, it cannot speak."
      number="86"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger">{error}</Alert>}
        {disconnectReason && (
          <Alert variant="warning">Meet session ended: {disconnectReason}</Alert>
        )}

        {/* Credentials */}
        <Card>
          <CardBody>
            <CardTitle>Join a Meeting</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Paste an OAuth access token with the
              <code> meetings.conference.media.audio.readonly</code> scope and the
              meeting's <code>spaces/&#123;id&#125;</code> name (or resolve it from the
              meeting code). See the README for how to obtain both.
            </p>
            <div className="space-y-4">
              <FormField
                label="OAuth access token"
                htmlFor="token"
                hint="Short-lived (about 1 hour) — used once, at connect time"
              >
                <Input
                  id="token"
                  type="password"
                  placeholder="ya29.a0…"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  disabled={joined}
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Meeting code (optional)"
                  htmlFor="code"
                  hint="From the meeting URL, e.g. abc-mnop-xyz"
                >
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      placeholder="abc-mnop-xyz"
                      value={meetingCode}
                      onChange={(e) => setMeetingCode(e.target.value)}
                      disabled={joined}
                    />
                    <Button
                      onClick={handleResolveSpace}
                      variant="outline"
                      disabled={joined || resolving || !accessToken.trim() || !meetingCode.trim()}
                    >
                      {resolving ? 'Resolving…' : 'Resolve'}
                    </Button>
                  </div>
                </FormField>

                <FormField
                  label="Space name"
                  htmlFor="space"
                  hint="Resource name in the form spaces/{id}"
                >
                  <Input
                    id="space"
                    placeholder="spaces/jQCFfuBOdN5z"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    disabled={joined}
                  />
                </FormField>
              </div>

              <div className="flex gap-2 items-center">
                <Badge variant={SESSION_COLORS[session] as any}>
                  {SESSION_LABELS[session]}
                </Badge>
                {!joined ? (
                  <Button
                    onClick={handleJoin}
                    variant="primary"
                    disabled={
                      session === 'connecting' || !accessToken.trim() || !spaceName.trim()
                    }
                  >
                    {session === 'connecting' ? 'Joining…' : 'Join Meeting'}
                  </Button>
                ) : (
                  <Button onClick={handleLeave} variant="outline">
                    Leave Meeting
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Transcript + notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Live Meeting Transcript</CardTitle>
              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    The mixed meeting audio is transcribed here once the session
                    reaches "in the meeting"…
                  </p>
                ) : (
                  transcripts.slice(-20).map((t) => (
                    <p
                      key={t.id}
                      className={`text-sm ${t.isFinal ? 'text-foreground' : 'text-foreground-muted italic'}`}
                    >
                      {t.text}
                    </p>
                  ))
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Meeting Notes (Claude)</CardTitle>
              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    Claude turns each utterance into a note — decisions, action
                    items, and key points land here.
                  </p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="flex gap-2 items-baseline">
                      <span className="text-xs text-foreground-muted shrink-0">{n.time}</span>
                      <p className="text-sm">{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </ExampleShell>
  );
}
