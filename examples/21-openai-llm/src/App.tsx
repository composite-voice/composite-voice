import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  OpenAILLM,
} from 'composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  FormField,
  Select,
  Input,
  Textarea,
} from 'composite-voice-ui';
import 'composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, affordable)' },
  { value: 'gpt-4o', label: 'GPT-4o (balanced)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (powerful)' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (legacy fast)' },
];

export default function App() {
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('200');
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
        new OpenAILLM({
          proxyUrl: `${window.location.origin}/proxy/openai`,
          model,
          systemPrompt,
          maxTokens: parseInt(maxTokens, 10) || 200,
          temperature: parseFloat(temperature) || 0.7,
          stream: true,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [model, temperature, maxTokens, systemPrompt]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="OpenAI LLM"
      description="NativeSTT + OpenAILLM + NativeTTS -- configure model, temperature, max tokens, and system prompt."
      number="21"
    >
      <Card className="mb-6">
        <CardBody>
          <CardTitle>OpenAI Configuration</CardTitle>
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

            <FormField label="Max Tokens" htmlFor="maxTokens" hint="Maximum response length">
              <Input
                id="maxTokens"
                type="number"
                min="50"
                max="4096"
                step="50"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
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
