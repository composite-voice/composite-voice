import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Badge,
  Select,
  Label,
  Button,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import type { LoggingConfig } from '@lukeocodes/composite-voice';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  id: number;
  timestamp: number;
  level: string;
  message: string;
  args: unknown[];
}

const LEVEL_COLORS: Record<string, string> = {
  debug: '#94a3b8',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
};

const LEVEL_BADGE_VARIANT: Record<string, string> = {
  debug: 'neutral',
  info: 'primary',
  warn: 'warning',
  error: 'danger',
};

let logIdCounter = 0;

export default function App() {
  const [logLevel, setLogLevel] = useState<LogLevel>('debug');
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const agentRef = useRef<CompositeVoice | null>(null);
  const logPanelRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<LogEntry[]>([]);

  // Custom logger function that captures logs to state
  const loggerFn = useCallback((level: string, message: string, ...args: unknown[]) => {
    const entry: LogEntry = {
      id: ++logIdCounter,
      timestamp: Date.now(),
      level,
      message,
      args,
    };
    logsRef.current = [...logsRef.current, entry].slice(-200); // Keep last 200
    setLogs([...logsRef.current]);
  }, []);

  // Auto-scroll log panel
  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [logs]);

  const loggingConfig: LoggingConfig = {
    enabled: true,
    level: logLevel,
    logger: loggerFn,
  };

  const configSnippet = `new CompositeVoice({
  providers: [ /* ... */ ],
  logging: {
    enabled: true,
    level: '${logLevel}',
    logger: (level, message, ...args) => {
      // Custom handler — route to UI panel, remote service, etc.
      myLogStore.push({ level, message, args });
    },
  },
})`;

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }
    logsRef.current = [];
    setLogs([]);

    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
      logging: loggingConfig,
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [logLevel, loggerFn]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const handleLogLevelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLogLevel(e.target.value as LogLevel);
    // Need to reinitialize to apply new level
    if (agentRef.current) {
      agentRef.current.dispose();
      agentRef.current = null;
      setAgent(null);
    }
  }, []);

  const handleClearLogs = useCallback(() => {
    logsRef.current = [];
    setLogs([]);
  }, []);

  // Count by level
  const levelCounts = logs.reduce<Record<string, number>>((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {});

  return (
    <ExampleShell
      title="Custom Logging"
      description="Route SDK logs to a custom handler. Control log level and view all SDK internal logs in real time."
      number="09"
    >
      <div className="space-y-6">
        {/* Log Level Control */}
        <Card>
          <CardBody>
            <CardTitle>Logging Configuration</CardTitle>
            <CardDescription>
              Change the log level to filter which messages appear. The custom logger function captures all logs to the panel below.
            </CardDescription>
            <div className="mt-4 flex items-end gap-4">
              <div className="max-w-xs">
                <Label htmlFor="log-level">Log Level</Label>
                <Select
                  id="log-level"
                  value={logLevel}
                  onChange={handleLogLevelChange}
                  options={[
                    { value: 'debug', label: 'debug -- all messages' },
                    { value: 'info', label: 'info -- info, warn, error' },
                    { value: 'warn', label: 'warn -- warn and error only' },
                    { value: 'error', label: 'error -- errors only' },
                  ]}
                />
              </div>
              <Button variant="outline" onClick={handleClearLogs}>Clear Logs</Button>
            </div>
            <div className="mt-3 flex gap-2">
              {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
                <Badge key={level} variant={LEVEL_BADGE_VARIANT[level] as any}>
                  {level}: {levelCounts[level] || 0}
                </Badge>
              ))}
              <Badge variant="neutral">total: {logs.length}</Badge>
            </div>
          </CardBody>
        </Card>

        {/* Config Preview */}
        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock code={configSnippet} language="typescript" />
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

        {/* Log Panel */}
        <Card>
          <CardBody>
            <CardTitle>SDK Log Output</CardTitle>
            <CardDescription>
              Captured via custom logger function. Showing last 200 entries.
            </CardDescription>
            <div
              ref={logPanelRef}
              className="mt-3 max-h-96 overflow-y-auto bg-neutral-900 rounded-lg p-3 font-mono text-xs"
            >
              {logs.length === 0 ? (
                <p className="text-neutral-500">No logs yet. Initialize the agent to start capturing.</p>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="py-0.5 border-b border-neutral-800 last:border-0"
                    style={{ color: LEVEL_COLORS[entry.level] || '#94a3b8' }}
                  >
                    <span className="text-neutral-600">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}
                    </span>
                    {' '}
                    <span className="font-bold uppercase" style={{ minWidth: '3rem', display: 'inline-block' }}>
                      [{entry.level}]
                    </span>
                    {' '}
                    <span>{entry.message}</span>
                    {entry.args.length > 0 && (
                      <span className="text-neutral-500">
                        {' '}{entry.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
