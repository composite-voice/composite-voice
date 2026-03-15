import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  MicrophoneInput,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';
import type { AgentState } from '@lukeocodes/composite-voice';

interface TimingEvent {
  label: string;
  timestamp: number;
  offsetMs: number;
}

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const [state, setState] = useState<AgentState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [timings, setTimings] = useState<TimingEvent[]>([]);
  const agentRef = useRef<CompositeVoice | null>(null);
  const t0Ref = useRef<number>(0);

  const configSnippet = `new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: 'claude-haiku-4-5' }),
    new DeepgramTTS({ proxyUrl: '/proxy/deepgram' }),
    new BrowserAudioOutput(),
  ],
  eagerLLM: {
    enabled: true,
    cancelOnTextChange: true,
    similarityThreshold: 0.8,
  },
})`;

  const addTiming = useCallback((label: string) => {
    const now = Date.now();
    if (t0Ref.current === 0) t0Ref.current = now;
    setTimings((prev) => [...prev, {
      label,
      timestamp: now,
      offsetMs: now - t0Ref.current,
    }]);
  }, []);

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    const newAgent = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new DeepgramSTT({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 150,
        }),
        new DeepgramTTS({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
        }),
        new BrowserAudioOutput(),
      ],
      eagerLLM: {
        enabled: true,
        cancelOnTextChange: true,
        similarityThreshold: 0.8,
      },
      logging: { enabled: true, level: 'debug' },
    });

    // State
    newAgent.on('agent.stateChange', (e) => setState(e.state));
    newAgent.on('agent.error', (e) => setError(e.error.message));

    // Transcription events
    newAgent.on('transcription.interim', (e) => {
      if (e.text.trim()) setTranscript(e.text);
    });

    newAgent.on('transcription.preflight', (e) => {
      t0Ref.current = Date.now();
      setTimings([{ label: 'Preflight', timestamp: Date.now(), offsetMs: 0 }]);
      setTranscript(`[preflight] ${e.text}`);
    });

    newAgent.on('transcription.speechFinal', (e) => {
      addTiming('Speech Final');
      setTranscript(e.text);
    });

    // LLM events
    newAgent.on('llm.start', () => {
      setResponse('');
    });

    newAgent.on('llm.chunk', (e) => {
      if (e.accumulated.length === e.chunk.length) {
        // First chunk
        addTiming('LLM First Token');
      }
      setResponse(e.accumulated);
    });

    newAgent.on('llm.complete', () => {
      addTiming('LLM Complete');
    });

    // TTS events
    newAgent.on('tts.start', () => {
      addTiming('TTS Start');
    });

    newAgent.on('tts.complete', () => {
      addTiming('TTS Complete');
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
    setInitialized(true);
  }, [addTiming]);

  const handleStart = useCallback(async () => {
    setError(null);
    t0Ref.current = 0;
    setTimings([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  // Compute latency comparison
  const preflightEvent = timings.find((t) => t.label === 'Preflight');
  const speechFinalEvent = timings.find((t) => t.label === 'Speech Final');
  const firstTokenEvent = timings.find((t) => t.label === 'LLM First Token');
  const ttsStartEvent = timings.find((t) => t.label === 'TTS Start');

  const eagerSaving = speechFinalEvent && preflightEvent
    ? speechFinalEvent.offsetMs - preflightEvent.offsetMs
    : null;

  return (
    <ExampleShell
      title="Eager Pipeline"
      description="Speculative LLM generation starts on preflight before speechFinal, reducing latency by 100-300ms."
      number="07"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        {/* Controls */}
        <div className="flex gap-2 items-center">
          <Badge variant={state === 'listening' ? 'success' : state === 'speaking' ? 'info' : 'neutral'}>
            {state}
          </Badge>
          {!initialized ? (
            <Button onClick={handleInit}>Initialize</Button>
          ) : state === 'ready' || state === 'idle' ? (
            <Button onClick={handleStart} variant="primary">Start Listening</Button>
          ) : (
            <Button onClick={handleStop} variant="outline">Stop</Button>
          )}
        </div>

        {/* Timing Panel */}
        <Card>
          <CardBody>
            <CardTitle>Pipeline Timing</CardTitle>
            <CardDescription>
              Timestamps relative to the first preflight event.
            </CardDescription>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-warning-600">
                  {preflightEvent ? `${preflightEvent.offsetMs}ms` : '--'}
                </p>
                <p className="text-xs text-foreground-muted">Preflight</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary-600">
                  {speechFinalEvent ? `${speechFinalEvent.offsetMs}ms` : '--'}
                </p>
                <p className="text-xs text-foreground-muted">Speech Final</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-success-600">
                  {firstTokenEvent ? `${firstTokenEvent.offsetMs}ms` : '--'}
                </p>
                <p className="text-xs text-foreground-muted">LLM First Token</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-info-600">
                  {ttsStartEvent ? `${ttsStartEvent.offsetMs}ms` : '--'}
                </p>
                <p className="text-xs text-foreground-muted">TTS Start</p>
              </div>
            </div>
            {eagerSaving !== null && (
              <div className="mt-4 p-3 bg-success-50 border border-success-200 rounded-lg text-center">
                <p className="text-sm font-medium text-success-700">
                  Eager pipeline saved ~{eagerSaving}ms by starting LLM on preflight instead of waiting for speechFinal
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Timeline */}
        <Card>
          <CardBody>
            <CardTitle>Event Timeline</CardTitle>
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {timings.length === 0 ? (
                <p className="text-sm text-foreground-muted">Speak to see pipeline events.</p>
              ) : (
                timings.map((t, i) => (
                  <div key={i} className="flex gap-3 items-center text-sm">
                    <Badge variant="neutral">{t.offsetMs}ms</Badge>
                    <span>{t.label}</span>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>

        {/* Transcript / Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Transcript</CardTitle>
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

        {/* Config */}
        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock code={configSnippet} language="typescript" />
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
