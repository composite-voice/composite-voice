import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  FormField,
  Input,
  Badge,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  DeepgramFlux,
  MicrophoneInput,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';

interface TurnEvent {
  id: number;
  event: string;
  transcript: string;
  confidence: number;
  timestamp: number;
}

const EVENT_BADGE_VARIANT: Record<string, string> = {
  StartOfTurn: 'neutral',
  Update: 'primary',
  EagerEndOfTurn: 'warning',
  TurnResumed: 'danger',
  EndOfTurn: 'success',
};

let eventIdCounter = 0;

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // DeepgramFlux configuration state
  const [eagerEotThreshold, setEagerEotThreshold] = useState(0.5);
  const [eotThreshold, setEotThreshold] = useState(0.7);
  const [eotTimeoutMs, setEotTimeoutMs] = useState(5000);
  const [keytermsInput, setKeytermsInput] = useState('');

  // Turn events from V2 API
  const [turnEvents, setTurnEvents] = useState<TurnEvent[]>([]);
  const [transcript, setTranscript] = useState('');

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    eventIdCounter = 0;
    setTurnEvents([]);
    setTranscript('');

    const keyterms = keytermsInput
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new DeepgramFlux({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          options: {
            eagerEotThreshold,
            eotThreshold,
            eotTimeoutMs,
            ...(keyterms.length > 0 ? { keyterms } : {}),
          },
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt:
            'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
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

    // Track V2 turn events from metadata
    voice.on('transcription.interim', (e) => {
      const meta = (e as any).metadata;
      const event = meta?.event;
      if (event) {
        setTurnEvents((prev) => [
          ...prev.slice(-50),
          {
            id: ++eventIdCounter,
            event,
            transcript: e.text,
            confidence: meta.end_of_turn_confidence ?? 0,
            timestamp: Date.now(),
          },
        ]);
      }
      if (e.text.trim()) setTranscript(e.text);
    });

    voice.on('transcription.preflight', (e) => {
      const meta = (e as any).metadata;
      setTurnEvents((prev) => [
        ...prev.slice(-50),
        {
          id: ++eventIdCounter,
          event: 'EagerEndOfTurn',
          transcript: e.text,
          confidence: meta?.end_of_turn_confidence ?? 0,
          timestamp: Date.now(),
        },
      ]);
      setTranscript(`[preflight] ${e.text}`);
    });

    voice.on('transcription.speechFinal', (e) => {
      const meta = (e as any).metadata;
      setTurnEvents((prev) => [
        ...prev.slice(-50),
        {
          id: ++eventIdCounter,
          event: 'EndOfTurn',
          transcript: e.text,
          confidence: meta?.end_of_turn_confidence ?? 0,
          timestamp: Date.now(),
        },
      ]);
      setTranscript(e.text);
    });

    await voice.initialize();
    agentRef.current = voice;
    setAgent(voice);
  }, [eagerEotThreshold, eotThreshold, eotTimeoutMs, keytermsInput]);

  const handleStart = useCallback(async () => {
    setTurnEvents([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  // Count events by type
  const eventCounts = turnEvents.reduce<Record<string, number>>((acc, evt) => {
    acc[evt.event] = (acc[evt.event] || 0) + 1;
    return acc;
  }, {});

  return (
    <ExampleShell
      title="DeepgramFlux (V2 STT)"
      description="Deepgram's V2 speech-to-text with structured turn events and eager end-of-turn detection for speculative LLM generation."
      number="14"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>DeepgramFlux Options</CardTitle>
            <CardDescription>
              Configure V2 turn detection thresholds. Lower eager threshold = faster speculative generation, but more false positives.
            </CardDescription>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <FormField
                label={`Eager EOT Threshold: ${eagerEotThreshold}`}
                htmlFor="eagerEot"
                hint="Confidence to fire EagerEndOfTurn (0.3–0.9)"
              >
                <Input
                  id="eagerEot"
                  type="range"
                  min={0.3}
                  max={0.9}
                  step={0.05}
                  value={eagerEotThreshold}
                  onChange={(e) => setEagerEotThreshold(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label={`EOT Threshold: ${eotThreshold}`}
                htmlFor="eot"
                hint="Confidence to fire EndOfTurn (0.5–0.9)"
              >
                <Input
                  id="eot"
                  type="range"
                  min={0.5}
                  max={0.9}
                  step={0.05}
                  value={eotThreshold}
                  onChange={(e) => setEotThreshold(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="EOT Timeout (ms)"
                htmlFor="eotTimeout"
                hint="Force end-of-turn after this many ms of silence"
              >
                <Input
                  id="eotTimeout"
                  type="number"
                  min={1000}
                  max={10000}
                  step={500}
                  value={eotTimeoutMs}
                  onChange={(e) => setEotTimeoutMs(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Keyterms"
                htmlFor="keyterms"
                hint="Comma-separated terms to boost recognition"
              >
                <Input
                  id="keyterms"
                  type="text"
                  placeholder="e.g. CompositeVoice, Deepgram"
                  value={keytermsInput}
                  onChange={(e) => setKeytermsInput(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Voice Agent Controls */}
        <VoiceAgent
          agent={agent}
          onInit={handleInit}
          onStart={handleStart}
          onStop={handleStop}
        />

        {/* Current Transcript */}
        <Card>
          <CardBody>
            <CardTitle>Transcript</CardTitle>
            <p className="text-sm mt-2">{transcript || 'Speak to see V2 turn events...'}</p>
          </CardBody>
        </Card>

        {/* V2 Turn Event Stream */}
        <Card>
          <CardBody>
            <CardTitle>V2 Turn Events</CardTitle>
            <CardDescription>
              Live stream of TurnInfo events from the Deepgram Flux API.
            </CardDescription>

            {/* Event counts */}
            <div className="mt-3 flex flex-wrap gap-2">
              {['StartOfTurn', 'Update', 'EagerEndOfTurn', 'TurnResumed', 'EndOfTurn'].map((evt) => (
                <Badge key={evt} variant={(EVENT_BADGE_VARIANT[evt] ?? 'neutral') as any} size="sm">
                  {evt}: {eventCounts[evt] || 0}
                </Badge>
              ))}
            </div>

            {/* Event timeline */}
            <div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto">
              {turnEvents.length === 0 ? (
                <p className="text-sm text-foreground-muted">No events yet.</p>
              ) : (
                turnEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 text-sm py-1 border-b border-neutral-100 last:border-0"
                  >
                    <span className="text-xs text-foreground-muted w-20 shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 })}
                    </span>
                    <Badge variant={(EVENT_BADGE_VARIANT[evt.event] ?? 'neutral') as any} size="sm">
                      {evt.event}
                    </Badge>
                    {evt.confidence > 0 && (
                      <span className="text-xs text-foreground-muted shrink-0">
                        EOT: {(evt.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="text-sm truncate">{evt.transcript}</span>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
