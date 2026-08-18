import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import { Card, CardBody, CardTitle, FormField, Select, Input } from 'composite-voice-ui';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  SpekoTTS,
  BrowserAudioOutput,
} from 'composite-voice';
import type { SpekoRouting } from 'composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // SpekoTTS configuration state
  const [routingMode, setRoutingMode] = useState<'auto' | 'explicit'>('auto');
  const [objective, setObjective] = useState('latency');
  const [pinnedProvider, setPinnedProvider] = useState('cartesia');
  const [pinnedModel, setPinnedModel] = useState('sonic-2');
  const [voice, setVoice] = useState('');
  const [sampleRate, setSampleRate] = useState(24000);

  // Conversation display
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');

  const handleInit = useCallback(async () => {
    const routing: SpekoRouting =
      routingMode === 'auto'
        ? { mode: 'auto', objective: objective as 'balanced' | 'quality' | 'latency' | 'cost' }
        : { mode: 'explicit', provider: pinnedProvider, model: pinnedModel };

    const voiceAgent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt:
            'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses to two or three sentences.',
          maxTokens: 200,
        }),
        new SpekoTTS({
          // The Vite dev proxy injects the Speko API key server-side; the
          // provider generates its own Idempotency-Key per request.
          proxyUrl: `${window.location.origin}/proxy/speko`,
          routing,
          sampleRate,
          // pcm_s16le is returned as a WAV Blob so the browser can play it
          encoding: 'pcm_s16le',
          ...(voice.trim() ? { voice: voice.trim() } : {}),
        }),
        new BrowserAudioOutput(),
      ],
    });

    voiceAgent.on('transcription.final', (e) => {
      if (e.text.trim()) setTranscript(e.text);
    });
    voiceAgent.on('llm.start', () => setResponse(''));
    voiceAgent.on('llm.chunk', (e) => setResponse((prev) => prev + e.chunk));

    await voiceAgent.initialize();
    agentRef.current = voiceAgent;
    setAgent(voiceAgent);
  }, [routingMode, objective, pinnedProvider, pinnedModel, voice, sampleRate]);

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
    { value: '16000', label: '16000 Hz' },
    { value: '24000', label: '24000 Hz (recommended)' },
    { value: '44100', label: '44100 Hz' },
    { value: '48000', label: '48000 Hz' },
  ];

  return (
    <ExampleShell
      title="SpekoTTS Configuration"
      description="Explore the Speko Relay voice-model router — objective-based routing across TTS providers, or explicit provider/model pinning."
      number="35"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>SpekoTTS Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization. Speko routes each
              synthesis request to the best upstream TTS provider for your objective.
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
                  <FormField
                    label="Voice ID"
                    htmlFor="voice"
                    hint="Optional provider voice ID (blank = route default)"
                  >
                    <Input
                      id="voice"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      disabled={!!agent}
                    />
                  </FormField>
                </>
              )}

              <FormField
                label="Sample rate"
                htmlFor="sample-rate"
                hint="Audio output sample rate from the relay"
              >
                <Select
                  id="sample-rate"
                  options={sampleRateOptions}
                  value={String(sampleRate)}
                  onChange={(e) => setSampleRate(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Voice Agent Controls */}
        <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />

        {/* Conversation */}
        {(transcript || response) && (
          <Card>
            <CardBody>
              <CardTitle>Conversation</CardTitle>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-1">
                    You said
                  </div>
                  <p className="text-sm text-foreground p-2 rounded bg-surface">
                    {transcript || '—'}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted mb-1">
                    AI response (spoken via Speko)
                  </div>
                  <p className="text-sm text-foreground p-2 rounded bg-surface">{response || '—'}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </ExampleShell>
  );
}
