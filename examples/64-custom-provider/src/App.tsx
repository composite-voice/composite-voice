import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import type {
  LLMProvider,
  LLMMessage,
  LLMStreamCallbacks,
  ProviderType,
} from '@lukeocodes/composite-voice';
import type { ProviderRole } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Input,
  Label,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

// ─── MockLLM: A custom LLM provider ─────────────────────────────────────

const CANNED_RESPONSES: Record<string, string> = {
  hello: 'Hello! I am a mock LLM provider. I respond with canned responses based on keywords in your speech.',
  weather: 'The weather is always sunny in mock-land! No actual weather data is available since I am a custom provider.',
  help: 'I can respond to hello, weather, help, and joke. Try saying one of these words!',
  joke: 'Why do programmers prefer dark mode? Because light attracts bugs!',
};

const DEFAULT_RESPONSE = 'I heard you, but I do not have a canned response for that. Try saying hello, weather, help, or joke.';

class MockLLM implements LLMProvider {
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['llm'];

  private initialized = false;
  private delay: number;

  constructor(config: { delay?: number } = {}) {
    this.delay = config.delay ?? 50;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized;
  }

  async generate(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    _signal?: AbortSignal,
  ): Promise<string> {
    const lastMessage = messages[messages.length - 1];
    const text = lastMessage?.content?.toLowerCase() ?? '';

    // Find matching canned response
    let response = DEFAULT_RESPONSE;
    for (const [keyword, cannedResponse] of Object.entries(CANNED_RESPONSES)) {
      if (text.includes(keyword)) {
        response = cannedResponse;
        break;
      }
    }

    // Simulate streaming by emitting word by word
    callbacks.onStart?.();

    const words = response.split(' ');
    let accumulated = '';
    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
      const chunk = (accumulated ? ' ' : '') + word;
      accumulated += chunk;
      callbacks.onChunk?.(chunk, accumulated);
    }

    callbacks.onComplete?.(accumulated);
    return accumulated;
  }

  async generateFromMessages(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.generate(messages, callbacks, signal);
  }
}

// ─── App Component ───────────────────────────────────────────────────────

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);
  const [delay, setDelay] = useState(50);
  const [generationLog, setGenerationLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setGenerationLog((prev) => [...prev.slice(-20), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const handleInit = useCallback(async () => {
    const mockLLM = new MockLLM({ delay });

    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
        mockLLM,
        new NativeTTS({ rate: 1.0, preferLocal: true }),
      ],
    });

    newAgent.on('llm.start', () => addLog('MockLLM: generation started'));
    newAgent.on('llm.chunk', (e) => addLog(`MockLLM: chunk "${e.chunk}"`));
    newAgent.on('llm.complete', (e) => addLog(`MockLLM: complete (${e.text.length} chars)`));
    newAgent.on('transcription.speechFinal', (e) => addLog(`Input: "${e.text}"`));

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [delay, addLog]);

  const handleStart = useCallback(async () => {
    setGenerationLog([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Custom Provider"
      description="Build a custom LLM provider from scratch. MockLLM returns canned responses with simulated streaming. No API keys needed."
      number="64"
    >
      <div className="space-y-6">
        <Alert variant="success" title="No API Keys Required">
          This example uses a custom MockLLM provider that returns canned responses.
          Try saying: hello, weather, help, or joke.
        </Alert>

        {/* Config */}
        <Card>
          <CardBody>
            <CardTitle>MockLLM Configuration</CardTitle>
            <div className="mt-3">
              <Label htmlFor="delay">
                Streaming Delay: {delay}ms per word
              </Label>
              <Input
                id="delay"
                type="range"
                min={10}
                max={200}
                step={10}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <div className="flex justify-between text-xs text-foreground-muted">
                <span>10ms (fast)</span>
                <span>200ms (slow, realistic)</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Canned Responses */}
        <Card>
          <CardBody>
            <CardTitle>
              Canned Responses <Badge variant="neutral">Keywords</Badge>
            </CardTitle>
            <div className="mt-3 space-y-2">
              {Object.entries(CANNED_RESPONSES).map(([keyword, resp]) => (
                <div key={keyword} className="flex gap-2 items-start">
                  <Badge variant="primary">{keyword}</Badge>
                  <p className="text-sm text-foreground-muted">{resp}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Provider Implementation */}
        <Card>
          <CardBody>
            <CardTitle>Custom Provider Implementation</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`import type { LLMProvider, LLMMessage, LLMStreamCallbacks, ProviderType } from '@lukeocodes/composite-voice';
import type { ProviderRole } from '@lukeocodes/composite-voice';

class MockLLM implements LLMProvider {
  // Required: declare provider type and roles
  public readonly type: ProviderType = 'rest';
  public readonly roles: readonly ProviderRole[] = ['llm'];

  private initialized = false;

  // Lifecycle methods
  async initialize(): Promise<void> { this.initialized = true; }
  async dispose(): Promise<void> { this.initialized = false; }
  isReady(): boolean { return this.initialized; }

  // Core method: generate a response from messages
  async generate(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<string> {
    const input = messages[messages.length - 1]?.content ?? '';

    callbacks.onStart?.();

    // Simulate streaming word by word
    const response = 'Hello from MockLLM!';
    const words = response.split(' ');
    let accumulated = '';

    for (const word of words) {
      if (signal?.aborted) break;
      await new Promise(r => setTimeout(r, 50));
      const chunk = (accumulated ? ' ' : '') + word;
      accumulated += chunk;
      callbacks.onChunk?.(chunk, accumulated);
    }

    callbacks.onComplete?.(accumulated);
    return accumulated;
  }

  // Alias required by the SDK interface
  async generateFromMessages(
    messages: LLMMessage[],
    callbacks: LLMStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.generate(messages, callbacks, signal);
  }
}

// Use it like any other provider:
const agent = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new MockLLM(),
    new NativeTTS(),
  ],
});`} />
            </div>
          </CardBody>
        </Card>

        {/* Generation Log */}
        <Card>
          <CardBody>
            <CardTitle>Generation Log</CardTitle>
            <div
              className="mt-3 max-h-48 overflow-y-auto font-mono text-xs"
              style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
            >
              {generationLog.length === 0 ? (
                <p className="text-foreground-muted">Generation events will appear here...</p>
              ) : (
                generationLog.map((log, i) => (
                  <div key={i} className="py-0.5 text-foreground-muted">{log}</div>
                ))
              )}
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
