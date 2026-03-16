import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
  RecoveryOrchestrator,
} from '@lukeocodes/composite-voice';
import type { RecoveryStrategy, RecoveryEvent } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Badge,
  Label,
  Input,
  Select,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

interface RecoveryLogEntry {
  id: number;
  timestamp: string;
  provider: string;
  attempt: number;
  maxAttempts: number;
  recovering: boolean;
  recovered: boolean;
  error: string;
}

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);
  const logIdRef = useRef(0);

  // Recovery Strategy config
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [initialDelay, setInitialDelay] = useState(1000);
  const [backoffMultiplier, setBackoffMultiplier] = useState(2);
  const [maxDelay, setMaxDelay] = useState(10000);

  // Recovery logs
  const [recoveryLogs, setRecoveryLogs] = useState<RecoveryLogEntry[]>([]);
  const [agentErrors, setAgentErrors] = useState<string[]>([]);

  const currentStrategy: RecoveryStrategy = {
    maxAttempts,
    initialDelay,
    backoffMultiplier,
    maxDelay,
  };

  const addRecoveryLog = useCallback((event: RecoveryEvent) => {
    const entry: RecoveryLogEntry = {
      id: ++logIdRef.current,
      timestamp: new Date().toISOString().split('T')[1]!.slice(0, 12),
      provider: event.provider,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      recovering: event.recovering,
      recovered: event.recovered,
      error: event.error?.message ?? 'unknown error',
    };
    setRecoveryLogs((prev) => [...prev.slice(-50), entry]);
  }, []);

  const handleInit = useCallback(async () => {
    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0, preferLocal: true }),
      ],
      autoRecover: true,
      recovery: currentStrategy,
    });

    newAgent.on('agent.error', (e) => {
      setAgentErrors((prev) => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${e.error.message}`]);
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [currentStrategy]);

  const handleStart = useCallback(async () => {
    setRecoveryLogs([]);
    setAgentErrors([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  // Compute delay schedule
  const delaySchedule = Array.from({ length: maxAttempts }, (_, i) => {
    return Math.min(initialDelay * Math.pow(backoffMultiplier, i), maxDelay);
  });

  return (
    <ExampleShell
      title="Error Recovery"
      description="Configure the RecoveryOrchestrator strategy, observe recovery events, and understand exponential backoff behavior."
      number="60"
    >
      <div className="space-y-6">
        {/* Recovery Strategy Config */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Recovery Strategy</CardTitle>
              <div className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="maxAttempts">Max Attempts</Label>
                  <Select
                    id="maxAttempts"
                    value={String(maxAttempts)}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  >
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="initialDelay">Initial Delay: {initialDelay}ms</Label>
                  <Input
                    id="initialDelay"
                    type="range"
                    min={100}
                    max={5000}
                    step={100}
                    value={initialDelay}
                    onChange={(e) => setInitialDelay(Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="backoffMul">Backoff Multiplier: {backoffMultiplier}x</Label>
                  <Input
                    id="backoffMul"
                    type="range"
                    min={1}
                    max={5}
                    step={0.5}
                    value={backoffMultiplier}
                    onChange={(e) => setBackoffMultiplier(Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="maxDelay">Max Delay: {(maxDelay / 1000).toFixed(1)}s</Label>
                  <Input
                    id="maxDelay"
                    type="range"
                    min={1000}
                    max={60000}
                    step={1000}
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle>Backoff Schedule Preview</CardTitle>
              <div className="space-y-2 mt-3">
                {delaySchedule.map((delay, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="neutral">Attempt {i + 1}</Badge>
                    <div
                      style={{
                        width: `${Math.min((delay / maxDelay) * 100, 100)}%`,
                        height: '8px',
                        background: 'var(--color-primary)',
                        borderRadius: '4px',
                        minWidth: '4px',
                      }}
                    />
                    <span className="text-sm text-foreground-muted">
                      {delay >= 1000 ? `${(delay / 1000).toFixed(1)}s` : `${delay}ms`}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-foreground-muted mt-2">
                  Formula: min(initialDelay * backoffMultiplier^(attempt-1), maxDelay)
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Config JSON */}
        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript">
{`const agent = new CompositeVoice({
  providers: [...],
  autoRecover: true,
  recovery: ${JSON.stringify(currentStrategy, null, 4)},
});`}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>

        {/* Error + Recovery Logs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Agent Errors</CardTitle>
              <div
                className="mt-3 max-h-48 overflow-y-auto font-mono text-xs"
                style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
              >
                {agentErrors.length === 0 ? (
                  <p className="text-foreground-muted">No errors yet. Errors trigger recovery automatically.</p>
                ) : (
                  agentErrors.map((err, i) => (
                    <div key={i} className="py-0.5 text-red-400">{err}</div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle>Recovery Events</CardTitle>
              <div
                className="mt-3 max-h-48 overflow-y-auto font-mono text-xs"
                style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
              >
                {recoveryLogs.length === 0 ? (
                  <p className="text-foreground-muted">Recovery events will appear here...</p>
                ) : (
                  recoveryLogs.map((log) => (
                    <div key={log.id} className="flex gap-2 py-0.5">
                      <span className="text-foreground-muted">{log.timestamp}</span>
                      <Badge variant={log.recovered ? 'success' : log.recovering ? 'warning' : 'danger'}>
                        {log.recovered ? 'recovered' : log.recovering ? `attempt ${log.attempt}/${log.maxAttempts}` : 'failed'}
                      </Badge>
                      <span className="text-foreground-muted">{log.provider}: {log.error}</span>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        <Alert variant="info" title="Note">
          Recovery events appear when provider errors occur (e.g., network timeouts,
          WebSocket disconnections). In normal operation with working API keys, you
          may not see recovery events. Try disconnecting your network briefly to trigger recovery.
        </Alert>

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
