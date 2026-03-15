import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  FormField,
  Select,
  Badge,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  ElevenLabsSTT,
  MicrophoneInput,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // ElevenLabsSTT configuration state
  const [model, setModel] = useState('scribe_v2_realtime');
  const [commitStrategy, setCommitStrategy] = useState<'vad' | 'manual'>('vad');
  const [audioFormat, setAudioFormat] = useState('pcm_16000');

  // Transcription results
  const [transcripts, setTranscripts] = useState<
    Array<{ text: string; isFinal: boolean; timestamp: number }>
  >([]);

  const handleInit = useCallback(async () => {
    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new ElevenLabsSTT({
          proxyUrl: `${window.location.origin}/proxy/elevenlabs`,
          model,
          commitStrategy,
          audioFormat,
          language: 'en',
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
        return [
          ...filtered,
          {
            text: e.text,
            isFinal: false,
            timestamp: Date.now(),
          },
        ];
      });
    });

    voice.on('transcription.final', (e) => {
      setTranscripts((prev) => {
        const filtered = prev.filter((t) => t.isFinal);
        return [
          ...filtered,
          {
            text: e.text,
            isFinal: true,
            timestamp: Date.now(),
          },
        ];
      });
    });

    await voice.initialize();
    agentRef.current = voice;
    setAgent(voice);
  }, [model, commitStrategy, audioFormat]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const modelOptions = [
    { value: 'scribe_v2_realtime', label: 'Scribe V2 Realtime (Latest)' },
  ];

  const commitStrategyOptions = [
    { value: 'vad', label: 'VAD (Voice Activity Detection)' },
    { value: 'manual', label: 'Manual (application-controlled)' },
  ];

  const audioFormatOptions = [
    { value: 'pcm_16000', label: 'PCM 16 kHz (default)' },
    { value: 'pcm_22050', label: 'PCM 22.05 kHz' },
    { value: 'pcm_24000', label: 'PCM 24 kHz' },
    { value: 'pcm_44100', label: 'PCM 44.1 kHz' },
    { value: 'mulaw_8000', label: 'mu-law 8 kHz (telephony)' },
  ];

  return (
    <ExampleShell
      title="ElevenLabsSTT Configuration"
      description="Explore ElevenLabs Scribe V2 real-time transcription options — model, commit strategy, and audio format."
      number="13"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>ElevenLabsSTT Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label="Model"
                htmlFor="model"
                hint="ElevenLabs STT model"
              >
                <Select
                  id="model"
                  options={modelOptions}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Commit Strategy"
                htmlFor="commitStrategy"
                hint="How transcription segments are finalized"
              >
                <Select
                  id="commitStrategy"
                  options={commitStrategyOptions}
                  value={commitStrategy}
                  onChange={(e) => setCommitStrategy(e.target.value as 'vad' | 'manual')}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Audio Format"
                htmlFor="audioFormat"
                hint="Encoding format sent to the API"
              >
                <Select
                  id="audioFormat"
                  options={audioFormatOptions}
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Commit Strategy Explanation */}
        <Card variant="filled">
          <CardBody>
            <CardTitle level={4}>Commit Strategy: {commitStrategy.toUpperCase()}</CardTitle>
            <p className="text-sm text-foreground-muted mt-2">
              {commitStrategy === 'vad' ? (
                <>
                  <strong>VAD (Voice Activity Detection)</strong> automatically commits
                  transcription segments when silence is detected. This is the default and
                  works well for conversational use cases where you want hands-free operation.
                </>
              ) : (
                <>
                  <strong>Manual</strong> mode gives your application full control over when
                  transcription segments are committed. Useful for scenarios like dictation
                  where you want explicit user action to finalize text.
                </>
              )}
            </p>
          </CardBody>
        </Card>

        {/* Voice Agent Controls */}
        <VoiceAgent
          agent={agent}
          onInit={handleInit}
          onStart={handleStart}
          onStop={handleStop}
        />

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
                      className={`text-sm ${t.isFinal ? 'text-foreground font-medium' : 'text-foreground-muted italic'}`}
                    >
                      {t.text}
                    </span>
                    <Badge
                      variant={t.isFinal ? 'primary' : 'default'}
                      size="sm"
                      className="shrink-0 ml-2"
                    >
                      {t.isFinal ? 'committed' : 'partial'}
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
