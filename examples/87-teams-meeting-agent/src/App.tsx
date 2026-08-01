import React, { useCallback, useRef, useState } from 'react';
import {
  CompositeVoice,
  TeamsCall,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';
import type { TeamsCallState } from '@lukeocodes/composite-voice';
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
  Textarea,
} from '@lukeocodes/composite-voice-ui';

interface TranscriptEntry {
  id: number;
  text: string;
  isFinal: boolean;
}

const CALL_STATE_COLORS: Partial<Record<TeamsCallState, string>> = {
  None: 'neutral',
  Connecting: 'warning',
  Ringing: 'warning',
  EarlyMedia: 'warning',
  InLobby: 'warning',
  Connected: 'success',
  LocalHold: 'info',
  RemoteHold: 'info',
  Disconnecting: 'warning',
  Disconnected: 'danger',
};

const AGENT_STATE_COLORS: Record<string, string> = {
  idle: 'neutral',
  ready: 'primary',
  listening: 'success',
  thinking: 'warning',
  speaking: 'info',
  error: 'danger',
};

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const entryIdRef = useRef(0);

  const [acsToken, setAcsToken] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [callState, setCallState] = useState<TeamsCallState | null>(null);
  const [agentState, setAgentState] = useState('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLeave = useCallback(async () => {
    const agent = agentRef.current;
    agentRef.current = null;
    try {
      await agent?.stopListening();
      await agent?.dispose(); // hangs up and releases the ACS call agent
    } catch {
      // best-effort teardown
    }
    setJoined(false);
    setJoining(false);
    setCallState(null);
    setAgentState('idle');
  }, []);

  const handleJoin = useCallback(async () => {
    setError(null);
    setTranscripts([]);
    setReply('');
    setJoining(true);

    try {
      const teams = new TeamsCall({
        token: acsToken.trim(),
        meetingLink: meetingLink.trim(),
        displayName: 'CompositeVoice Agent',
      });

      teams.onCallStateChanged((state) => setCallState(state));

      const agent = new CompositeVoice({
        providers: [
          teams, // duplex: fills both the 'input' and 'output' roles
          new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
          new AnthropicLLM({
            proxyUrl: `${window.location.origin}/proxy/anthropic`,
            model: 'claude-haiku-4-5-20251001',
            systemPrompt:
              'You are a helpful assistant participating in a Microsoft Teams meeting. Respond in plain text only — no markdown, no lists, no code blocks. Keep responses to one or two short conversational sentences.',
            maxTokens: 200,
          }),
          new DeepgramTTS({
            proxyUrl: `${window.location.origin}/proxy/deepgram`,
            outputFormat: 'linear16',
            sampleRate: 24000,
          }),
        ],
      });

      agent.on('agent.stateChange', (e) => setAgentState(e.state));
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
      agent.on('llm.start', () => setReply(''));
      agent.on('llm.chunk', (e) => setReply(e.accumulated));
      agent.on('agent.error', (e) => setError(e.error.message));

      await agent.initialize(); // joins the meeting (may land in the lobby)
      agentRef.current = agent;
      await agent.startListening();
      setJoined(true);
    } catch (e) {
      setError((e as Error).message);
      await handleLeave();
    } finally {
      setJoining(false);
    }
  }, [acsToken, meetingLink, handleLeave]);

  return (
    <ExampleShell
      title="Teams Meeting Agent"
      description="TeamsCall joins a Microsoft Teams meeting as an external participant via Azure Communication Services — the agent hears the meeting's mixed audio and speaks Claude's replies back into the call."
      number="87"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger">{error}</Alert>}
        {callState === 'InLobby' && (
          <Alert variant="warning">
            Waiting in the Teams lobby — a meeting participant must admit
            "CompositeVoice Agent". No audio flows until then.
          </Alert>
        )}

        {/* Join form */}
        <Card>
          <CardBody>
            <CardTitle>Join a Teams Meeting</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Paste an ACS user access token (issued server-side with the
              <code> voip</code> scope) and the meeting's join link. See the README
              for the az CLI one-liner that mints a token.
            </p>
            <div className="space-y-4">
              <FormField
                label="ACS user access token"
                htmlFor="token"
                hint="Short-lived JWT from your Azure Communication Services resource"
              >
                <Textarea
                  id="token"
                  rows={3}
                  placeholder="eyJhbGciOi…"
                  value={acsToken}
                  onChange={(e) => setAcsToken(e.target.value)}
                  disabled={joined || joining}
                />
              </FormField>

              <FormField
                label="Teams meeting link"
                htmlFor="link"
                hint="From the Outlook/Teams invite"
              >
                <Input
                  id="link"
                  placeholder="https://teams.microsoft.com/l/meetup-join/19%3ameeting_…"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  disabled={joined || joining}
                />
              </FormField>

              <div className="flex gap-2 items-center flex-wrap">
                <Badge variant={(callState && CALL_STATE_COLORS[callState]) as any ?? 'neutral'}>
                  call: {callState ?? 'not joined'}
                </Badge>
                <Badge variant={AGENT_STATE_COLORS[agentState] as any}>
                  agent: {agentState}
                </Badge>
                {!joined ? (
                  <Button
                    onClick={handleJoin}
                    variant="primary"
                    disabled={joining || !acsToken.trim() || !meetingLink.trim()}
                  >
                    {joining ? 'Joining…' : 'Join Meeting'}
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

        {/* Transcript + reply */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Live Meeting Transcript</CardTitle>
              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    The meeting's mixed audio is transcribed here once the call
                    is Connected…
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
              <CardTitle>Agent Reply</CardTitle>
              <p className="text-sm mt-3">
                {reply || (
                  <span className="text-foreground-muted">
                    Claude's reply streams here — and is spoken into the meeting
                    by DeepgramTTS through the TeamsCall output.
                  </span>
                )}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </ExampleShell>
  );
}
