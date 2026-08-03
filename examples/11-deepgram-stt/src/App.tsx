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
  DeepgramSTT,
  MicrophoneInput,
  AnthropicLLM,
  NativeTTS,
} from 'composite-voice';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  // DeepgramSTT configuration state
  const [model, setModel] = useState('nova-3');
  const [endpointing, setEndpointing] = useState(300);
  const [utteranceEndMs, setUtteranceEndMs] = useState(1000);
  const [interimResults, setInterimResults] = useState(true);
  const [smartFormat, setSmartFormat] = useState(true);
  const [punctuation, setPunctuation] = useState(true);

  // Transcription results
  const [transcripts, setTranscripts] = useState<
    Array<{ text: string; confidence: number; isFinal: boolean; timestamp: number }>
  >([]);

  const handleInit = useCallback(async () => {
    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new DeepgramSTT({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          language: 'en-US',
          options: {
            model,
            endpointing,
            utteranceEndMs,
            interimResults,
            smartFormat,
            punctuation,
            vadEvents: true,
          },
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
  }, [model, endpointing, utteranceEndMs, interimResults, smartFormat, punctuation]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const modelOptions = [
    { value: 'nova-3', label: 'Nova 3 (Latest)' },
    { value: 'nova-3-medical', label: 'Nova 3 Medical' },
    { value: 'nova-2', label: 'Nova 2' },
    { value: 'nova-2-general', label: 'Nova 2 General' },
    { value: 'nova-2-meeting', label: 'Nova 2 Meeting' },
    { value: 'nova-2-finance', label: 'Nova 2 Finance' },
    { value: 'nova-2-conversationalai', label: 'Nova 2 Conversational AI' },
    { value: 'nova-2-voicemail', label: 'Nova 2 Voicemail' },
    { value: 'nova-2-medical', label: 'Nova 2 Medical' },
  ];

  return (
    <ExampleShell
      title="DeepgramSTT Configuration"
      description="Explore Deepgram Nova real-time transcription options — model, endpointing, smart formatting, and more."
      number="11"
    >
      <div className="space-y-6">
        {/* Configuration Panel */}
        <Card>
          <CardBody>
            <CardTitle>DeepgramSTT Options</CardTitle>
            <p className="text-sm text-foreground-muted mt-1 mb-4">
              Configure before initializing. Changes require re-initialization.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Model" htmlFor="model" hint="Deepgram transcription model">
                <Select
                  id="model"
                  options={modelOptions}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Endpointing (ms)"
                htmlFor="endpointing"
                hint="Silence duration before end-of-speech (ms)"
              >
                <Input
                  id="endpointing"
                  type="number"
                  min={10}
                  max={5000}
                  step={50}
                  value={endpointing}
                  onChange={(e) => setEndpointing(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <FormField
                label="Utterance End (ms)"
                htmlFor="utteranceEndMs"
                hint="Gap before UtteranceEnd event fires"
              >
                <Input
                  id="utteranceEndMs"
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={utteranceEndMs}
                  onChange={(e) => setUtteranceEndMs(Number(e.target.value))}
                  disabled={!!agent}
                />
              </FormField>

              <div className="flex flex-col gap-3 justify-center">
                <Checkbox
                  label="Interim Results"
                  description="Stream partial transcripts while speaking"
                  checked={interimResults}
                  onChange={(e) => setInterimResults(e.target.checked)}
                  disabled={!!agent}
                />
                <Checkbox
                  label="Smart Format"
                  description="Auto-punctuation and readability improvements"
                  checked={smartFormat}
                  onChange={(e) => setSmartFormat(e.target.checked)}
                  disabled={!!agent}
                />
                <Checkbox
                  label="Punctuation"
                  description="Add punctuation to transcripts"
                  checked={punctuation}
                  onChange={(e) => setPunctuation(e.target.checked)}
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
