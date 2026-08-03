import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  GroqLLM,
} from 'composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  FormField,
  Select,
  Input,
  Textarea,
} from 'composite-voice-ui';
import 'composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

const MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'LLaMA 3.3 70B Versatile' },
  { value: 'llama-3.1-8b-instant', label: 'LLaMA 3.1 8B Instant' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (32k context)' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B IT' },
];

export default function App() {
  const [model, setModel] = useState('llama-3.3-70b-versatile');
  const [temperature, setTemperature] = useState('0.7');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.'
  );
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new GroqLLM({
          proxyUrl: `${window.location.origin}/proxy/groq`,
          model,
          systemPrompt,
          temperature: parseFloat(temperature) || 0.7,
          stream: true,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [model, temperature, systemPrompt]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Groq LLM"
      description="NativeSTT + GroqLLM + NativeTTS -- ultra-fast inference powered by Groq LPU hardware."
      number="22"
    >
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <CardTitle>Groq Configuration</CardTitle>
            <Badge variant="success">Ultra-Fast</Badge>
          </div>
          <p className="text-sm text-foreground-muted mb-4">
            Groq uses custom LPU (Language Processing Unit) hardware for extremely fast inference,
            often exceeding 500 tokens per second. Try speaking and notice how quickly the response starts streaming.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        agent={agent}
        onInit={handleInit}
        onStart={handleStart}
        onStop={handleStop}
      />
    </ExampleShell>
  );
}
