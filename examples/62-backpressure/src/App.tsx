import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Label,
  Input,
  Alert,
  CodeBlock,
  ProgressBar,
} from '@lukeocodes/composite-voice-ui';

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  const [maxPendingChunks, setMaxPendingChunks] = useState(5);
  const [llmChunks, setLlmChunks] = useState(0);
  const [ttsChunks, setTtsChunks] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [queueStats, setQueueStats] = useState({ inputSize: 0, outputSize: 0 });
  const [overflowCount, setOverflowCount] = useState(0);

  const handleInit = useCallback(async () => {
    const newAgent = new CompositeVoice({
      providers: [
        new MicrophoneInput({ sampleRate: 16000, format: 'pcm' }),
        new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown. Give detailed responses of about 4-5 sentences.',
          maxTokens: 400,
        }),
        new DeepgramTTS({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          model: 'aura-asteria-en',
        }),
        new BrowserAudioOutput(),
      ],
      pipeline: {
        maxPendingChunks,
      },
      queue: {
        input: { maxSize: 2000 },
        output: { maxSize: 500 },
      },
    });

    newAgent.on('llm.chunk', () => {
      setLlmChunks((c) => c + 1);
      setPendingCount((c) => Math.min(c + 1, maxPendingChunks));
    });
    newAgent.on('tts.audio', () => {
      setTtsChunks((c) => c + 1);
      setPendingCount((c) => Math.max(c - 1, 0));
    });
    newAgent.on('llm.start', () => {
      setLlmChunks(0);
      setTtsChunks(0);
      setPendingCount(0);
    });
    newAgent.on('queue.stats', (e) => {
      const data = e as any;
      if (data.queueName === 'input') {
        setQueueStats((prev) => ({ ...prev, inputSize: data.size }));
      } else if (data.queueName === 'output') {
        setQueueStats((prev) => ({ ...prev, outputSize: data.size }));
      }
    });
    newAgent.on('queue.overflow', () => {
      setOverflowCount((c) => c + 1);
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [maxPendingChunks]);

  const handleStart = useCallback(async () => {
    setLlmChunks(0);
    setTtsChunks(0);
    setPendingCount(0);
    setOverflowCount(0);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Backpressure"
      description="Control pipeline.maxPendingChunks to throttle LLM-to-TTS flow. Observe how backpressure affects the pending chunk count in real-time."
      number="62"
    >
      <div className="space-y-6">
        {/* Config */}
        <Card>
          <CardBody>
            <CardTitle>Pipeline Backpressure Configuration</CardTitle>
            <div className="mt-3">
              <Label htmlFor="maxPending">
                maxPendingChunks: {maxPendingChunks}
              </Label>
              <Input
                id="maxPending"
                type="range"
                min={1}
                max={20}
                step={1}
                value={maxPendingChunks}
                onChange={(e) => setMaxPendingChunks(Number(e.target.value))}
              />
              <div className="flex justify-between text-xs text-foreground-muted">
                <span>1 (aggressive throttle)</span>
                <span>20 (relaxed)</span>
              </div>
              <Alert variant="info" title="What this does" className="mt-3">
                When the LLM produces text chunks faster than the TTS can synthesize them,
                this setting limits how many chunks can be buffered. Lower values throttle
                the LLM, higher values let it run freely.
              </Alert>
            </div>
          </CardBody>
        </Card>

        {/* Real-time Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardBody>
              <CardTitle>LLM Chunks</CardTitle>
              <p className="text-2xl font-bold mt-2">{llmChunks}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>TTS Chunks</CardTitle>
              <p className="text-2xl font-bold mt-2">{ttsChunks}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Pending</CardTitle>
              <p className="text-2xl font-bold mt-2">{pendingCount}</p>
              <ProgressBar
                value={pendingCount}
                max={maxPendingChunks}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Overflows</CardTitle>
              <p className="text-2xl font-bold mt-2">{overflowCount}</p>
            </CardBody>
          </Card>
        </div>

        {/* Queue Stats */}
        <Card>
          <CardBody>
            <CardTitle>Queue Status</CardTitle>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <p className="text-sm text-foreground-muted">Input Queue</p>
                <p className="text-lg font-bold">{queueStats.inputSize} chunks</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Output Queue</p>
                <p className="text-lg font-bold">{queueStats.outputSize} chunks</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Code */}
        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`const agent = new CompositeVoice({
  providers: [...],
  pipeline: {
    maxPendingChunks: ${maxPendingChunks},  // Throttle LLM -> TTS
  },
  queue: {
    input: { maxSize: 2000 },   // Input -> STT buffer
    output: { maxSize: 500 },   // TTS -> Output buffer
  },
});

// Monitor queue events
agent.on('queue.stats', (e) => {
  console.log(e.queueName, e.size, 'buffered');
});
agent.on('queue.overflow', (e) => {
  console.warn(e.queueName, e.droppedChunks, 'dropped');
});`} />
            </div>
          </CardBody>
        </Card>

        {/* Voice Agent */}
        <VoiceAgent
          agent={agent}
          onInit={handleInit}
          onStart={handleStart}
          onStop={handleStop}
        />
      </div>
    </ExampleShell>
  );
}
