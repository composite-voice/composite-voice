import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  FormField,
  Select,
  Input,
  Checkbox,
  Badge,
} from 'composite-voice-ui';
import {
  CompositeVoice,
  SpekoSTT,
  MicrophoneInput,
  AnthropicLLM,
  NativeTTS,
} from 'composite-voice';
import type { SpekoRouting } from 'composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // SpekoSTT configuration state
  const [routingMode, setRoutingMode] = useState<'auto' | 'explicit'>('auto');
  const [objective, setObjective] = useState('latency');
  const [pinnedProvider, setPinnedProvider] = useState('deepgram');
  const [pinnedModel, setPinnedModel] = useState('nova-3');
  const [sampleRate, setSampleRate] = useState(16000);
  const [interimResults, setInterimResults] = useState(true);

  // Transcription results
  const [transcripts, setTranscripts] = useState<
    Array<{ text: string; isFinal: boolean; timestamp: number }>
  >([]);

  const handleInit = useCallback(async () => {
    const routing: SpekoRouting =
      routingMode === 'auto'
        ? { mode: 'auto', objective: objective as 'balanced' | 'quality' | 'latency' | 'cost' }
        : { mode: 'explicit', provider: pinnedProvider, model: pinnedModel };

    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new SpekoSTT({
          // The Speko Relay authenticates WebSocket upgrades with headers
          // browsers cannot set — the Vite dev proxy injects the API key and
          // a fresh Idempotency-Key per connection (see vite.config.ts).
          proxyUrl: `${window.location.origin}/proxy/speko`,
          routing,
          sampleRate,
          interimResults,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt:
            'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
        }),
        new NativeTTS({
          rate: 1.0,
          preferLocal: true,
        }),
      ],
    });

    voice.on('transcription.interim', (e) => {
      setTranscripts((prev) => {
        const filtered = prev.filter((t) => t.isFinal);
        return [...filtered, { text: e.text, isFinal: false, timestamp: Date.now() }];
      });
    });

    voice.on('transcription.final', (e) => {
      setTranscripts((prev) => {
        const filtered = prev.filter((t) => t.isFinal);
        return [...filtered, { text: e.text, isFinal: true, timestamp: Date.now() }];
      });
    });

    await voice.initialize();
    agentRef.current = voice;
    setAgent(voice);
  }, [routingMode, objective, pinnedProvider, pinnedModel, sampleRate, interimResults]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const objectiveOptions = [
    { value: 'balanced', label: 'Balanced (relay default)' },
    { value: 'quality', label: 'Quality' },
    { value: 'latency', label: 'Latency' },
    { value: 'cost', label: 'Cost' },
  ];

  const sampleRateOptions = [
    { value: '8000', label: '8000 Hz (telephony)' },
    { value: '16000', label: '16000 Hz (recommended)' },
    { value: '24000', label: '24000 Hz' },
    { value: '48000', label: '48000 Hz' },
  ];

  return (
    <ExampleShell
      title="SpekoSTT Configuration"
      description="Explore the Speko Relay voice-model router — objective-based routing across STT providers, or explicit provider/model pinning."
      number="15"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>SpekoSTT Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization. Speko routes each
              session to the best upstream STT provider for your objective.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Routing mode"
                htmlFor="routing-mode"
                hint="Auto lets Speko pick the provider; explicit pins one"
              >
                <Select
                  id="routing-mode"
                  options={[
                    { value: 'auto', label: 'Auto (routed, with failover)' },
                    { value: 'explicit', label: 'Explicit (pin provider + model)' },
                  ]}
                  value={routingMode}
                  onChange={(e) => setRoutingMode(e.target.value as 'auto' | 'explicit')}
                  disabled={!!agent}
                />
              </FormField>

              {routingMode === 'auto' ? (
                <FormField
                  label="Objective"
                  htmlFor="objective"
                  hint="How the relay ranks candidate providers"
                >
                  <Select
                    id="objective"
                    options={objectiveOptions}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    disabled={!!agent}
                  />
                </FormField>
              ) : (
                <>
                  <FormField
                    label="Provider"
                    htmlFor="pinned-provider"
                    hint="Upstream provider ID (no failover)"
                  >
                    <Input
                      id="pinned-provider"
                      value={pinnedProvider}
                      onChange={(e) => setPinnedProvider(e.target.value)}
                      disabled={!!agent}
                    />
                  </FormField>
                  <FormField
                    label="Model"
                    htmlFor="pinned-model"
                    hint="The pinned provider's model ID"
                  >
                    <Input
                      id="pinned-model"
                      value={pinnedModel}
                      onChange={(e) => setPinnedModel(e.target.value)}
                      disabled={!!agent}
                    />
                  </FormField>
                </>
              )}

              <FormField
                label="Sample rate"
                htmlFor="sample-rate"
                hint="Microphone audio sample rate sent to the relay"
              >
                <Select
                  id="sample-rate"
                  options={sampleRateOptions}
                  value={String(sampleRate)}
                  onChange={(e) => setSampleRate(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <div className="flex flex-col gap-3 justify-center">
                <Checkbox
                  label="Interim Results"
                  description="Stream transcript.delta frames while speaking"
                  checked={interimResults}
                  onChange={(e) => setInterimResults(e.target.checked)}
                  disabled={!!agent}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Voice Agent Controls */}
        <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />

        {/* Transcription Results */}
        {transcripts.length > 0 && (
          <Card>
            <CardBody>
              <CardTitle>Transcription Results</CardTitle>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {transcripts.slice(-15).map((t) => (
                  <div
                    key={t.timestamp}
                    className="flex items-center justify-between p-2 rounded bg-surface"
                  >
                    <span
                      className={`text-sm ${t.isFinal ? 'text-foreground' : 'text-foreground-muted italic'}`}
                    >
                      {t.text}
                    </span>
                    <Badge variant={t.isFinal ? 'primary' : 'default'} size="sm">
                      {t.isFinal ? 'final' : 'interim'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </ExampleShell>
  );
}
