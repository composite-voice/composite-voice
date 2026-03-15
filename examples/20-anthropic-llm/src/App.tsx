import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  AnthropicLLM,
} from '@lukeocodes/composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  FormField,
  Select,
  Input,
  Textarea,
  Checkbox,
} from '@lukeocodes/composite-voice-ui';
import '@lukeocodes/composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku (fast, cost-effective)' },
  { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet (balanced)' },
  { value: 'claude-opus-4-6-20250610', label: 'Opus (highest quality)' },
];

export default function App() {
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('200');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.'
  );
  const [streaming, setStreaming] = useState(true);
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
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model,
          systemPrompt,
          maxTokens: parseInt(maxTokens, 10) || 200,
          temperature: parseFloat(temperature) || 0.7,
          stream: streaming,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await agentRef.current.initialize();
  }, [model, temperature, maxTokens, systemPrompt, streaming]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Anthropic LLM"
      description="NativeSTT + AnthropicLLM + NativeTTS -- configure model, temperature, max tokens, system prompt, and streaming."
      number="20"
    >
      <Card className="mb-6">
        <CardBody>
          <CardTitle>Anthropic Configuration</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <FormField label="Model" htmlFor="model">
              <Select
                id="model"
                options={MODELS}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </FormField>

            <FormField label="Temperature" htmlFor="temperature" hint="0.0 = deterministic, 1.0 = creative">
              <Input
                id="temperature"
                type="number"
                min="0"
                max="1"
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

            <div className="flex items-end pb-1">
              <Checkbox
                label="Streaming"
                description="Stream tokens as they are generated"
                checked={streaming}
                onChange={(e) => setStreaming(e.target.checked)}
              />
            </div>
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
