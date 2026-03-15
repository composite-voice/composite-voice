import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  GeminiLLM,
} from '@lukeocodes/composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  FormField,
  Select,
  Input,
  Textarea,
} from '@lukeocodes/composite-voice-ui';
import '@lukeocodes/composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

const MODELS = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (powerful)' },
];

export default function App() {
  const [model, setModel] = useState('gemini-2.0-flash');
  const [temperature, setTemperature] = useState('0.7');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.'
  );
  const agentRef = useRef<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    agentRef.current = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new GeminiLLM({
          proxyUrl: `${window.location.origin}/proxy/gemini`,
          model,
          systemPrompt,
          temperature: parseFloat(temperature) || 0.7,
          stream: true,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await agentRef.current.initialize();
  }, [model, temperature, systemPrompt]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Gemini LLM"
      description="NativeSTT + GeminiLLM + NativeTTS -- Google's Gemini models via their OpenAI-compatible endpoint."
      number="23"
    >
      <Card className="mb-6">
        <CardBody>
          <CardTitle>Gemini Configuration</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <FormField label="Model" htmlFor="model">
              <Select
                id="model"
                options={MODELS}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </FormField>

            <FormField label="Temperature" htmlFor="temperature" hint="0.0 = deterministic, 2.0 = creative">
              <Input
                id="temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </FormField>
          </div>

          <div className="mt-4">
            <FormField label="System Prompt" htmlFor="systemPrompt">
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
              />
            </FormField>
          </div>
        </CardBody>
      </Card>

      <VoiceAgent
        agent={agentRef.current}
        onInit={handleInit}
        onStart={handleStart}
        onStop={handleStop}
      />
    </ExampleShell>
  );
}
