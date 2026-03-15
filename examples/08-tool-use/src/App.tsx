import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Badge,
  Button,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import type { AgentState, LLMToolDefinition, LLMToolCall, LLMToolResult } from '@lukeocodes/composite-voice';

interface ToolEvent {
  type: 'call' | 'result';
  timestamp: number;
  toolName: string;
  data: Record<string, unknown>;
}

// Tool definitions
const toolDefinitions: LLMToolDefinition[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a given city. Returns temperature and conditions.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'The city name, e.g. "San Francisco"' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_time',
    description: 'Get the current time in a given timezone or city.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City or timezone, e.g. "Tokyo" or "America/New_York"' },
      },
      required: ['location'],
    },
  },
  {
    name: 'calculate',
    description: 'Perform a basic arithmetic calculation.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression, e.g. "42 * 17"' },
      },
      required: ['expression'],
    },
  },
];

// Mock tool implementations
function executeGetWeather(args: Record<string, unknown>): string {
  const city = String(args.city || 'Unknown');
  const unit = String(args.unit || 'fahrenheit');
  const temp = unit === 'celsius' ? Math.floor(Math.random() * 30 + 5) : Math.floor(Math.random() * 50 + 40);
  const conditions = ['sunny', 'partly cloudy', 'overcast', 'rainy', 'windy'][Math.floor(Math.random() * 5)];
  return JSON.stringify({ city, temperature: temp, unit, conditions });
}

function executeGetTime(args: Record<string, unknown>): string {
  const location = String(args.location || 'UTC');
  // Simple timezone mapping
  const offsets: Record<string, number> = {
    tokyo: 9, london: 0, 'new york': -5, 'los angeles': -8,
    paris: 1, sydney: 11, 'san francisco': -8, berlin: 1,
  };
  const offset = offsets[location.toLowerCase()] ?? 0;
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + offset * 3600000);
  return JSON.stringify({ location, time: local.toLocaleTimeString('en-US'), offset: `UTC${offset >= 0 ? '+' : ''}${offset}` });
}

function executeCalculate(args: Record<string, unknown>): string {
  const expr = String(args.expression || '0');
  try {
    // Safe eval with only math operators
    const sanitized = expr.replace(/[^0-9+\-*/.() ]/g, '');
    const result = Function(`"use strict"; return (${sanitized})`)();
    return JSON.stringify({ expression: expr, result: Number(result) });
  } catch {
    return JSON.stringify({ expression: expr, error: 'Invalid expression' });
  }
}

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const [state, setState] = useState<AgentState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const agentRef = useRef<CompositeVoice | null>(null);

  const addToolEvent = useCallback((event: ToolEvent) => {
    setToolEvents((prev) => [...prev, event]);
  }, []);

  const handleToolCall = useCallback(async (toolCall: LLMToolCall): Promise<LLMToolResult> => {
    addToolEvent({
      type: 'call',
      timestamp: Date.now(),
      toolName: toolCall.name,
      data: toolCall.arguments,
    });

    let content: string;
    switch (toolCall.name) {
      case 'get_weather':
        content = executeGetWeather(toolCall.arguments);
        break;
      case 'get_time':
        content = executeGetTime(toolCall.arguments);
        break;
      case 'calculate':
        content = executeCalculate(toolCall.arguments);
        break;
      default:
        content = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
    }

    const result: LLMToolResult = {
      toolCallId: toolCall.id,
      content,
    };

    addToolEvent({
      type: 'result',
      timestamp: Date.now(),
      toolName: toolCall.name,
      data: JSON.parse(content),
    });

    return result;
  }, [addToolEvent]);

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
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant with access to tools. Use tools when the user asks about weather, time, or math. Keep spoken responses concise.',
          maxTokens: 300,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
      tools: {
        definitions: toolDefinitions,
        onToolCall: handleToolCall,
      },
      conversationHistory: { enabled: true, maxTurns: 10 },
    });

    newAgent.on('agent.stateChange', (e) => setState(e.state));
    newAgent.on('agent.error', (e) => setError(e.error.message));
    newAgent.on('transcription.interim', (e) => { if (e.text.trim()) setTranscript(e.text); });
    newAgent.on('transcription.speechFinal', (e) => setTranscript(e.text));
    newAgent.on('llm.start', () => setResponse(''));
    newAgent.on('llm.chunk', (e) => setResponse(e.accumulated));

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
    setInitialized(true);
  }, [handleToolCall]);

  const handleStart = useCallback(async () => {
    setError(null);
    setToolEvents([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const toolDefsSnippet = JSON.stringify(toolDefinitions, null, 2);

  return (
    <ExampleShell
      title="Tool Use"
      description="LLM function calling with get_weather, get_time, and calculate tools. Ask about weather, time, or math."
      number="08"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        {/* Controls */}
        <div className="flex gap-2 items-center">
          <Badge variant={state === 'listening' ? 'success' : state === 'speaking' ? 'info' : 'neutral'}>
            {state}
          </Badge>
          {!initialized ? (
            <Button onClick={handleInit}>Initialize</Button>
          ) : state === 'ready' || state === 'idle' ? (
            <Button onClick={handleStart} variant="primary">Start Listening</Button>
          ) : (
            <Button onClick={handleStop} variant="outline">Stop</Button>
          )}
        </div>

        {/* Transcript / Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Transcript</CardTitle>
              <p className="text-sm mt-2">{transcript || 'Try: "What\'s the weather in Paris?"'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Response</CardTitle>
              <p className="text-sm mt-2">{response || 'Waiting for response...'}</p>
            </CardBody>
          </Card>
        </div>

        {/* Tool Events */}
        <Card>
          <CardBody>
            <CardTitle>Tool Calls & Results</CardTitle>
            <CardDescription>
              Watch tool invocations and their results as they happen.
            </CardDescription>
            <div className="mt-4 space-y-3 max-h-72 overflow-y-auto">
              {toolEvents.length === 0 ? (
                <p className="text-sm text-foreground-muted">No tool calls yet. Ask about weather, time, or math.</p>
              ) : (
                toolEvents.map((evt, i) => (
                  <div key={i} className="border border-neutral-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={evt.type === 'call' ? 'warning' : 'success'}>
                        {evt.type === 'call' ? 'CALL' : 'RESULT'}
                      </Badge>
                      <span className="text-sm font-mono font-medium">{evt.toolName}</span>
                      <span className="text-xs text-foreground-muted ml-auto">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-xs bg-neutral-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(evt.data, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>

        {/* Available Tools */}
        <Card>
          <CardBody>
            <CardTitle>Tool Definitions</CardTitle>
            <div className="mt-3">
              <CodeBlock code={toolDefsSnippet} language="json" />
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
