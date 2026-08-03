import { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  WebLLMLLM,
} from 'composite-voice';
import type { WebLLMLoadProgress } from 'composite-voice';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  FormField,
  Select,
  ProgressBar,
  Alert,
  Textarea,
} from 'composite-voice-ui';
import 'composite-voice-ui/theme.css';

import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

const MODELS = [
  { value: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'LLaMA 3.2 1B (smallest, fastest)' },
  { value: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'LLaMA 3.2 3B (balanced)' },
  { value: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 Mini (Microsoft)' },
  { value: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', label: 'Mistral 7B Instruct' },
  { value: 'gemma-2-2b-it-q4f16_1-MLC', label: 'Gemma 2 2B IT (Google)' },
];

export default function App() {
  const [model, setModel] = useState('Llama-3.2-1B-Instruct-q4f16_1-MLC');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful voice assistant running locally in the browser. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.'
  );
  const [loadProgress, setLoadProgress] = useState<WebLLMLoadProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    setIsLoading(true);
    setLoadProgress(null);

    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new WebLLMLLM({
          model,
          systemPrompt,
          stream: true,
          onLoadProgress: (progress: WebLLMLoadProgress) => {
            setLoadProgress(progress);
          },
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
    setIsLoading(false);
  }, [model, systemPrompt]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="WebLLM (In-Browser)"
      description="NativeSTT + WebLLMLLM + NativeTTS -- runs entirely in your browser via WebGPU. No API key or server needed."
      number="25"
    >
      <Alert variant="info" title="Browser Requirements" className="mb-6">
        WebLLM requires WebGPU support (Chrome 113+, Edge 113+). The first model load downloads
        weights (100 MB+) and compiles WebGPU shaders. Subsequent loads use browser cache.
      </Alert>

      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <CardTitle>WebLLM Configuration</CardTitle>
            <Badge variant="info">No API Key</Badge>
            <Badge variant="neutral">Offline-Capable</Badge>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <FormField label="Model" htmlFor="model" hint="Smaller models load faster and use less GPU memory">
              <Select
                id="model"
                options={MODELS}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isLoading}
              />
            </FormField>

            <FormField label="System Prompt" htmlFor="systemPrompt">
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                disabled={isLoading}
              />
            </FormField>
          </div>

          {isLoading && loadProgress && (
            <div className="mt-4">
              <ProgressBar
                value={Math.round(loadProgress.progress * 100)}
                max={100}
                label="Loading Model"
                showValue
                color="primary"
                size="md"
              />
              <p className="text-xs text-foreground-muted mt-1">{loadProgress.text}</p>
            </div>
          )}
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
