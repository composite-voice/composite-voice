import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Badge,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

interface BargeInEvent {
  id: number;
  timestamp: string;
  type: 'interrupt' | 'generation-start' | 'generation-cancel' | 'playback-stop' | 'playback-start';
  detail: string;
}

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const eventIdRef = useRef(0);

  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [bargeInEvents, setBargeInEvents] = useState<BargeInEvent[]>([]);
  const [interruptCount, setInterruptCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addBargeInEvent = useCallback((type: BargeInEvent['type'], detail: string) => {
    const entry: BargeInEvent = {
      id: ++eventIdRef.current,
      timestamp: new Date().toISOString().split('T')[1]!.slice(0, 12),
      type,
      detail,
    };
    setBargeInEvents((prev) => [...prev.slice(-30), entry]);
  }, []);

  const handleInit = useCallback(async () => {
    try {
      setError(null);
      const agent = new CompositeVoice({
        providers: [
          new MicrophoneInput({ sampleRate: 16000, format: 'pcm' }),
          new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
          new AnthropicLLM({
            proxyUrl: `${window.location.origin}/proxy/anthropic`,
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'You are a helpful voice assistant. Give detailed responses of about 4-5 sentences so the user has time to interrupt you.',
            maxTokens: 400,
          }),
          new DeepgramTTS({
            proxyUrl: `${window.location.origin}/proxy/deepgram`,
            model: 'aura-asteria-en',
          }),
          new BrowserAudioOutput(),
        ],
        turnTaking: {
          pauseCaptureOnPlayback: false, // Allow barge-in
        },
      });

      agent.on('agent.stateChange', (e) => {
        setState(e.state);
        if (e.state === 'speaking') {
          setIsSpeaking(true);
          addBargeInEvent('playback-start', 'Agent started speaking');
        }
        if (e.previousState === 'speaking' && e.state !== 'speaking') {
          setIsSpeaking(false);
          addBargeInEvent('playback-stop', 'Agent stopped speaking');
        }
      });

      agent.on('transcription.interim', (e) => setTranscript(e.text));
      agent.on('transcription.speechFinal', (e) => {
        setTranscript(e.text);
        if (isSpeaking) {
          setInterruptCount((c) => c + 1);
          addBargeInEvent('interrupt', `User interrupted: "${e.text}"`);
        }
      });
      agent.on('llm.start', () => {
        setResponse('');
        addBargeInEvent('generation-start', 'LLM generation started');
      });
      agent.on('llm.chunk', (e) => setResponse(e.accumulated));
      agent.on('agent.error', (e) => setError(e.error.message));

      agentRef.current = agent;
      await agent.initialize();
      setInitialized(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [addBargeInEvent, isSpeaking]);

  const handleStart = useCallback(async () => {
    setBargeInEvents([]);
    setInterruptCount(0);
    await agentRef.current?.startListening();
    setRunning(true);
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
    setRunning(false);
  }, []);

  const handleStopSpeaking = useCallback(() => {
    agentRef.current?.stopSpeaking();
    addBargeInEvent('generation-cancel', 'Manual stop via stopSpeaking()');
  }, [addBargeInEvent]);

  return (
    <ExampleShell
      title="Barge-In"
      description="Full-duplex mode with barge-in support. Interrupt the agent mid-speech by speaking or clicking Stop Speaking."
      number="61"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        <Alert variant="info" title="How to Barge In">
          With pauseCaptureOnPlayback set to false, the microphone stays active while
          the agent speaks. Speak over the agent or press Stop Speaking to interrupt.
        </Alert>

        {/* Controls */}
        <div className="flex gap-2 items-center flex-wrap">
          <Badge
            variant={
              state === 'speaking' ? 'success' :
              state === 'listening' ? 'warning' :
              state === 'thinking' ? 'info' : 'neutral'
            }
          >
            {state}
          </Badge>
          {!initialized ? (
            <Button onClick={handleInit} variant="primary">Initialize</Button>
          ) : !running ? (
            <Button onClick={handleStart} variant="primary">Start Listening</Button>
          ) : (
            <Button onClick={handleStop} variant="outline">Stop</Button>
          )}
          <Button
            onClick={handleStopSpeaking}
            variant="danger"
            disabled={!isSpeaking}
          >
            Stop Speaking
          </Button>
          <Badge variant="danger" className="ml-auto">
            Interrupts: {interruptCount}
          </Badge>
        </div>

        {/* Transcript + Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>
                Transcript
                {isSpeaking && <Badge variant="warning" className="ml-2">agent speaking</Badge>}
              </CardTitle>
              <p className="text-sm mt-2">{transcript || 'Waiting for speech...'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Response</CardTitle>
              <p className="text-sm mt-2">{response || 'Waiting for response...'}</p>
            </CardBody>
          </Card>
        </div>

        {/* Barge-In Event Log */}
        <Card>
          <CardBody>
            <CardTitle>Barge-In Event Log</CardTitle>
            <div
              className="mt-3 max-h-48 overflow-y-auto font-mono text-xs"
              style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
            >
              {bargeInEvents.length === 0 ? (
                <p className="text-foreground-muted">Events will appear here when you interact with the agent...</p>
              ) : (
                bargeInEvents.map((evt) => (
                  <div key={evt.id} className="flex gap-2 py-0.5">
                    <span className="text-foreground-muted flex-shrink-0">{evt.timestamp}</span>
                    <Badge variant={
                      evt.type === 'interrupt' ? 'danger' :
                      evt.type === 'playback-start' ? 'success' :
                      evt.type === 'playback-stop' ? 'neutral' : 'warning'
                    }>
                      {evt.type}
                    </Badge>
                    <span className="text-foreground-muted truncate">{evt.detail}</span>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>

        {/* Code */}
        <Card>
          <CardBody>
            <CardTitle>How to Enable Barge-In</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript">
{`// Enable full-duplex mode (mic stays active during playback)
const agent = new CompositeVoice({
  providers: [...],
  turnTaking: {
    pauseCaptureOnPlayback: false, // Key setting for barge-in
  },
});

// Manually stop the agent mid-speech
agent.stopSpeaking();

// The agent will detect speech during playback and:
// 1. Stop current audio playback
// 2. Cancel in-flight TTS
// 3. Process the new user input`}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
