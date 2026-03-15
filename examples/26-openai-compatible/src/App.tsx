import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  OpenAICompatibleLLM,
} from '@lukeocodes/composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  FormField,
  Input,
  Textarea,
  Alert,
} from '@lukeocodes/composite-voice-ui';
import '@lukeocodes/composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const [endpoint, setEndpoint] = useState('http://localhost:1234/v1');
  const [modelName, setModelName] = useState('local-model');
  const [apiKey, setApiKey] = useState('');
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
        new OpenAICompatibleLLM({
          baseURL: endpoint,
          apiKey: apiKey || 'not-needed',
          model: modelName,
          systemPrompt,
          temperature: parseFloat(temperature) || 0.7,
          stream: true,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await agentRef.current.initialize();
  }, [endpoint, modelName, apiKey, temperature, systemPrompt]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="OpenAI-Compatible LLM"
      description="NativeSTT + OpenAICompatibleLLM + NativeTTS -- connect to any service that speaks the OpenAI chat completions format."
      number="26"
    >
      <Alert variant="info" title="Custom Endpoint" className="mb-6">
        Point this at any OpenAI-compatible service: LM Studio, Ollama, vLLM, text-generation-webui,
        LocalAI, or any cloud provider with an OpenAI-compatible API. No Vite proxy is used --
        requests go directly to your endpoint.
      </Alert>

      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <CardTitle>Endpoint Configuration</CardTitle>
            <Badge variant="neutral">No Proxy</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Endpoint URL" htmlFor="endpoint" hint="Base URL with /v1 path">
              <Input
                id="endpoint"
                type="url"
                placeholder="http://localhost:1234/v1"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </FormField>

            <FormField label="Model Name" htmlFor="modelName" hint="Model identifier for the endpoint">
              <Input
                id="modelName"
                type="text"
                placeholder="local-model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </FormField>

            <FormField label="API Key" htmlFor="apiKey" hint="Leave empty if not required">
              <Input
                id="apiKey"
                type="password"
                placeholder="Optional API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
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
