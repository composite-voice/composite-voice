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
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // NativeSTT configuration state
  const [language, setLanguage] = useState('en-US');
  const [continuous, setContinuous] = useState(true);
  const [interimResults, setInterimResults] = useState(true);
  const [maxAlternatives, setMaxAlternatives] = useState(1);

  // Transcription results with confidence
  const [transcripts, setTranscripts] = useState<
    Array<{ text: string; confidence: number; isFinal: boolean; timestamp: number }>
  >([]);

  const handleInit = useCallback(async () => {
    const voice = new CompositeVoice({
      providers: [
        new NativeSTT({
          language,
          continuous,
          interimResults,
          maxAlternatives,
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

    // Track transcription results with confidence scores
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
          },
        ];
      });
    });

    await voice.initialize();
    agentRef.current = voice;
    setAgent(voice);
  }, [language, continuous, interimResults, maxAlternatives]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const languageOptions = [
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'es-ES', label: 'Spanish (Spain)' },
    { value: 'fr-FR', label: 'French (France)' },
    { value: 'de-DE', label: 'German' },
    { value: 'it-IT', label: 'Italian' },
    { value: 'pt-BR', label: 'Portuguese (Brazil)' },
    { value: 'ja-JP', label: 'Japanese' },
    { value: 'ko-KR', label: 'Korean' },
    { value: 'zh-CN', label: 'Chinese (Simplified)' },
  ];

  return (
    <ExampleShell
      title="NativeSTT Configuration"
      description="Explore Web Speech API options — language, continuous mode, interim results, and max alternatives."
      number="10"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>NativeSTT Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Language" htmlFor="language" hint="BCP-47 language tag">
                <Select
                  id="language"
                  options={languageOptions}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Max Alternatives"
                htmlFor="maxAlternatives"
                hint="Number of alternative transcriptions (1-5)"
              >
                <Input
                  id="maxAlternatives"
                  type="number"
                  min={1}
                  max={5}
                  value={maxAlternatives}
                  onChange={(e) => setMaxAlternatives(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <div className="flex flex-col gap-3">
                <Checkbox
                  label="Continuous"
                  description="Keep listening between pauses"
                  checked={continuous}
                  onChange={(e) => setContinuous(e.target.checked)}
                  disabled={!!agent}
                />
              </div>

              <div className="flex flex-col gap-3">
                <Checkbox
                  label="Interim Results"
                  description="Stream partial words while speaking"
                  checked={interimResults}
                  onChange={(e) => setInterimResults(e.target.checked)}
                  disabled={!!agent}
                />
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

        {/* Transcription Results with Confidence */}
        {transcripts.length > 0 && (
          <Card>
            <CardBody>
              <CardTitle>Transcription Results</CardTitle>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {transcripts.slice(-10).map((t) => (
                  <div
                    key={t.timestamp}
                    className="flex items-center justify-between p-2 rounded bg-surface"
                  >
                    <span
                      className={`text-sm ${t.isFinal ? 'text-foreground' : 'text-foreground-muted italic'}`}
                    >
                      {t.text}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {t.confidence > 0 && (
                        <Badge
                          variant={t.confidence > 0.8 ? 'success' : t.confidence > 0.5 ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {(t.confidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                      <Badge variant={t.isFinal ? 'primary' : 'default'} size="sm">
                        {t.isFinal ? 'final' : 'interim'}
                      </Badge>
                    </div>
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
