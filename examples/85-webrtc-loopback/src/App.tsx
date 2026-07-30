import React, { useCallback, useRef, useState } from 'react';
import {
  CompositeVoice,
  WebRTCInput,
  WebRTCOutput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
} from '@lukeocodes/composite-voice-ui';

type Status = 'idle' | 'connecting' | 'live';

interface TranscriptEntry {
  id: number;
  text: string;
  isFinal: boolean;
}

const STATE_COLORS: Record<string, string> = {
  idle: 'neutral',
  ready: 'primary',
  listening: 'success',
  thinking: 'warning',
  speaking: 'info',
  error: 'danger',
};

const PC_COLORS: Record<string, string> = {
  new: 'neutral',
  connecting: 'warning',
  connected: 'success',
  disconnected: 'danger',
  failed: 'danger',
  closed: 'neutral',
};

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const pcARef = useRef<RTCPeerConnection | null>(null);
  const pcBRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const entryIdRef = useRef(0);

  const [status, setStatus] = useState<Status>('idle');
  const [pcAState, setPcAState] = useState('new');
  const [pcBState, setPcBState] = useState('new');
  const [agentState, setAgentState] = useState('idle');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(async () => {
    const agent = agentRef.current;
    agentRef.current = null;
    try {
      await agent?.stopListening();
      await agent?.dispose();
    } catch {
      // best-effort teardown
    }
    pcARef.current?.close();
    pcBRef.current?.close();
    pcARef.current = null;
    pcBRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setPcAState('new');
    setPcBState('new');
    setAgentState('idle');
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setTranscripts([]);
    setReply('');
    setStatus('connecting');

    try {
      // 1. The pipeline. WebRTCInput consumes a remote track; WebRTCOutput
      //    renders the agent's voice into a publishable local track.
      const input = new WebRTCInput({ targetSampleRate: 16000 });
      const output = new WebRTCOutput({ sampleRate: 48000 });

      const agent = new CompositeVoice({
        providers: [
          input,
          new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
          new AnthropicLLM({
            proxyUrl: `${window.location.origin}/proxy/anthropic`,
            model: 'claude-haiku-4-5-20251001',
            systemPrompt:
              'You are a helpful voice assistant on a WebRTC call. Respond in plain text only — no markdown, no lists, no code blocks. Keep responses to one or two short sentences.',
            maxTokens: 200,
          }),
          new DeepgramTTS({
            proxyUrl: `${window.location.origin}/proxy/deepgram`,
            outputFormat: 'linear16',
            sampleRate: 24000,
          }),
          output,
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

      await agent.initialize();
      agentRef.current = agent;

      // 2. Local microphone — this stands in for "a remote participant".
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;

      // 3. Two peer connections wired back-to-back. In a real app pcB would
      //    live on someone else's machine behind a signaling server — here we
      //    just hand candidates and SDP across directly.
      const pcA = new RTCPeerConnection();
      const pcB = new RTCPeerConnection();
      pcARef.current = pcA;
      pcBRef.current = pcB;

      pcA.onicecandidate = (e) => {
        if (e.candidate) void pcB.addIceCandidate(e.candidate);
      };
      pcB.onicecandidate = (e) => {
        if (e.candidate) void pcA.addIceCandidate(e.candidate);
      };
      pcA.onconnectionstatechange = () => setPcAState(pcA.connectionState);
      pcB.onconnectionstatechange = () => setPcBState(pcB.connectionState);

      // Mic -> pcA ==network==> pcB -> pipeline. The remote track that pops
      // out of pcB is handed straight to startListening(): WebRTCInput
      // implements attach(), so CompositeVoice forwards the track to it.
      for (const track of mic.getAudioTracks()) {
        pcA.addTrack(track, mic);
      }
      pcB.ontrack = (event) => {
        if (event.track.kind === 'audio') {
          void agent.startListening(event.track).catch((e: unknown) => {
            setError((e as Error).message);
          });
        }
      };

      // Pipeline -> pcB ==network==> pcA -> <audio> element. The agent's
      // voice travels back over WebRTC and plays like any remote participant.
      pcB.addTrack(output.getTrack(), output.getStream());
      pcA.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject =
            event.streams[0] ?? new MediaStream([event.track]);
        }
      };

      // 4. Offer/answer — no signaling server needed since both peers are local.
      const offer = await pcA.createOffer();
      await pcA.setLocalDescription(offer);
      await pcB.setRemoteDescription(offer);
      const answer = await pcB.createAnswer();
      await pcB.setLocalDescription(answer);
      await pcA.setRemoteDescription(answer);

      setStatus('live');
    } catch (e) {
      setError((e as Error).message);
      await cleanup();
      setStatus('idle');
    }
  }, [cleanup]);

  const handleStop = useCallback(async () => {
    await cleanup();
    setStatus('idle');
  }, [cleanup]);

  return (
    <ExampleShell
      title="WebRTC Loopback Agent"
      description="WebRTCInput + WebRTCOutput over two local RTCPeerConnections wired to each other — the full 'join anything WebRTC' pattern with zero platform accounts. Wear headphones to avoid echo."
      number="85"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* Connection panel */}
        <Card>
          <CardBody>
            <CardTitle>Loopback Call</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Mic → pcA → pcB → STT → LLM → TTS → pcB → pcA → speakers. Both
              peer connections run in this tab; swap pcB for LiveKit, Daily, or
              any SFU and the pipeline code does not change.
            </p>
            <div className="flex gap-2 items-center flex-wrap">
              <Badge variant={STATE_COLORS[agentState] as any}>agent: {agentState}</Badge>
              <Badge variant={PC_COLORS[pcAState] as any}>pcA: {pcAState}</Badge>
              <Badge variant={PC_COLORS[pcBState] as any}>pcB: {pcBState}</Badge>
              {status !== 'live' ? (
                <Button
                  onClick={handleStart}
                  variant="primary"
                  disabled={status === 'connecting'}
                >
                  {status === 'connecting' ? 'Connecting…' : 'Start Loopback Call'}
                </Button>
              ) : (
                <Button onClick={handleStop} variant="outline">
                  Hang Up
                </Button>
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm text-foreground-muted mb-1">
                Agent voice (received on pcA, like a remote participant):
              </p>
              <audio ref={audioRef} autoPlay controls style={{ width: '100%' }} />
            </div>
          </CardBody>
        </Card>

        {/* Transcript + reply */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Live Transcript</CardTitle>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {transcripts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">
                    Speak into your microphone once the call is live…
                  </p>
                ) : (
                  transcripts.slice(-12).map((t) => (
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
                    The agent's reply streams here and plays through the loop…
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
