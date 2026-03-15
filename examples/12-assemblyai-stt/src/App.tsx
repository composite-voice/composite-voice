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
  Badge,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  AssemblyAISTT,
  MicrophoneInput,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // AssemblyAISTT configuration state
  const [sampleRate, setSampleRate] = useState(16000);
  const [language, setLanguage] = useState('en');
  const [wordBoostInput, setWordBoostInput] = useState('');

  // Transcription results with confidence and word-level data
  const [transcripts, setTranscripts] = useState<
    Array<{
      text: string;
      confidence: number;
      isFinal: boolean;
      timestamp: number;
      words?: Array<{ text: string; confidence: number }>;
    }>
  >([]);

  const handleInit = useCallback(async () => {
    const wordBoost = wordBoostInput
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new AssemblyAISTT({
          proxyUrl: `${window.location.origin}/proxy/assemblyai`,
          sampleRate,
          language,
          ...(wordBoost.length > 0 ? { wordBoost } : {}),
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
            confidence: (e as any).confidence ?? 0,
            isFinal: false,
            timestamp: Date.now(),
            words: (e as any).words,
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
            confidence: (e as any).confidence ?? 0,
            isFinal: true,
            timestamp: Date.now(),
            words: (e as any).words,
          },
        ];
      });
    });

    await voice.initialize();
    agentRef.current = voice;
    setAgent(voice);
  }, [sampleRate, language, wordBoostInput]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const sampleRateOptions = [
    { value: '16000', label: '16000 Hz (default)' },
    { value: '8000', label: '8000 Hz (telephony)' },
    { value: '22050', label: '22050 Hz' },
    { value: '44100', label: '44100 Hz (CD quality)' },
    { value: '48000', label: '48000 Hz' },
  ];

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'nl', label: 'Dutch' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'zh', label: 'Chinese' },
  ];

  return (
    <ExampleShell
      title="AssemblyAISTT Configuration"
      description="Explore AssemblyAI real-time transcription options — sample rate, language, and word boost."
      number="12"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>AssemblyAISTT Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Sample Rate"
                htmlFor="sampleRate"
                hint="Audio sample rate in Hz"
              >
                <Select
                  id="sampleRate"
                  options={sampleRateOptions}
                  value={String(sampleRate)}
                  onChange={(e) => setSampleRate(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <FormField label="Language" htmlFor="language" hint="Transcription language">
                <Select
                  id="language"
                  options={languageOptions}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField
                  label="Word Boost"
                  htmlFor="wordBoost"
                  hint="Comma-separated list of words to boost recognition accuracy"
                >
                  <Input
                    id="wordBoost"
                    type="text"
                    placeholder="e.g. CompositeVoice, Deepgram, AssemblyAI"
                    value={wordBoostInput}
                    onChange={(e) => setWordBoostInput(e.target.value)}
                    disabled={!!agent}
                  />
                </FormField>
              </div>
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

        {/* Transcription Results with Word-Level Confidence */}
        {transcripts.length > 0 && (
          <Card>
            <CardBody>
              <CardTitle>Transcription Results</CardTitle>
              <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
                {transcripts.slice(-10).map((t) => (
                  <div key={t.timestamp} className="p-3 rounded bg-surface">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm ${t.isFinal ? 'text-foreground font-medium' : 'text-foreground-muted italic'}`}
                      >
                        {t.text}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {t.confidence > 0 && (
                          <Badge
                            variant={
                              t.confidence > 0.9
                                ? 'success'
                                : t.confidence > 0.7
                                  ? 'warning'
                                  : 'danger'
                            }
                            size="sm"
                          >
                            {(t.confidence * 100).toFixed(1)}%
                          </Badge>
                        )}
                        <Badge variant={t.isFinal ? 'primary' : 'default'} size="sm">
                          {t.isFinal ? 'final' : 'partial'}
                        </Badge>
                      </div>
                    </div>
                    {/* Word-level confidence breakdown for final results */}
                    {t.isFinal && t.words && t.words.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.words.map((w, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-neutral-100"
                            title={`Confidence: ${(w.confidence * 100).toFixed(1)}%`}
                          >
                            {w.text}
                            <span
                              className={`text-xs ${
                                w.confidence > 0.9
                                  ? 'text-success-600'
                                  : w.confidence > 0.7
                                    ? 'text-warning-600'
                                    : 'text-danger-600'
                              }`}
                            >
                              {(w.confidence * 100).toFixed(0)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
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
