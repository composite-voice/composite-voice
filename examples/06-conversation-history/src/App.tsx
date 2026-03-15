import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Badge,
  Input,
  Label,
  Checkbox,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import type { ConversationHistoryConfig, LLMMessage } from '@lukeocodes/composite-voice';

export default function App() {
  const [maxTurns, setMaxTurns] = useState(10);
  const [maxTokens, setMaxTokens] = useState(4000);
  const [preserveSystem, setPreserveSystem] = useState(true);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const [history, setHistory] = useState<LLMMessage[]>([]);
  const agentRef = useRef<CompositeVoice | null>(null);

  const historyConfig: ConversationHistoryConfig = {
    enabled: true,
    maxTurns,
    maxTokens,
    preserveSystemMessages: preserveSystem,
  };

  const configSnippet = `new CompositeVoice({
  providers: [ /* ... */ ],
  conversationHistory: {
    enabled: true,
    maxTurns: ${maxTurns},
    maxTokens: ${maxTokens},
    preserveSystemMessages: ${preserveSystem},
  },
})`;

  // Poll conversation history from agent
  useEffect(() => {
    if (!agentRef.current) return;
    const interval = setInterval(() => {
      const mgr = (agentRef.current as any)?.conversationManager;
      if (mgr?.getHistory) {
        setHistory([...mgr.getHistory()]);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [agent]);

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
          systemPrompt: 'You are a helpful voice assistant. Keep responses to two or three sentences. Remember what the user has said in previous turns.',
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0 }),
      ],
      conversationHistory: historyConfig,
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
    setHistory([]);
  }, [maxTurns, maxTokens, preserveSystem]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const estimatedTokens = history.reduce((sum, msg) => {
    const text = typeof msg.content === 'string' ? msg.content : '';
    return sum + Math.ceil(text.length / 4);
  }, 0);

  const turnCount = Math.floor(history.filter((m) => m.role === 'user').length);

  return (
    <ExampleShell
      title="Conversation History"
      description="Configure multi-turn conversation memory. Adjust maxTurns, maxTokens, and preserveSystemMessages, then watch the history grow."
      number="06"
    >
      <div className="space-y-6">
        {/* History Config Controls */}
        <Card>
          <CardBody>
            <CardTitle>History Configuration</CardTitle>
            <CardDescription>
              Changing these values will require re-initializing the agent.
            </CardDescription>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="max-turns">maxTurns</Label>
                <Input
                  id="max-turns"
                  type="number"
                  min={0}
                  max={50}
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(Number(e.target.value))}
                />
                <p className="text-xs text-foreground-muted mt-1">0 = unlimited</p>
              </div>
              <div>
                <Label htmlFor="max-tokens">maxTokens</Label>
                <Input
                  id="max-tokens"
                  type="number"
                  min={0}
                  max={100000}
                  step={500}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                />
                <p className="text-xs text-foreground-muted mt-1">Approximate token budget</p>
              </div>
              <div className="flex items-end">
                <Checkbox
                  label="preserveSystemMessages"
                  description="Keep system messages during trimming"
                  checked={preserveSystem}
                  onChange={(e) => setPreserveSystem(e.target.checked)}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card variant="outlined">
            <CardBody>
              <p className="text-xs text-foreground-muted">Turns</p>
              <p className="text-2xl font-bold">{turnCount} / {maxTurns || 'unlimited'}</p>
            </CardBody>
          </Card>
          <Card variant="outlined">
            <CardBody>
              <p className="text-xs text-foreground-muted">Est. Tokens</p>
              <p className="text-2xl font-bold">{estimatedTokens} / {maxTokens}</p>
            </CardBody>
          </Card>
          <Card variant="outlined">
            <CardBody>
              <p className="text-xs text-foreground-muted">Messages</p>
              <p className="text-2xl font-bold">{history.length}</p>
            </CardBody>
          </Card>
        </div>

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

        {/* Conversation History Display */}
        <Card>
          <CardBody>
            <CardTitle>Conversation History</CardTitle>
            <CardDescription>
              Live view of the message array sent to the LLM.
            </CardDescription>
            <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-foreground-muted">No messages yet. Initialize and start speaking.</p>
              ) : (
                history.map((msg, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Badge
                      variant={
                        msg.role === 'system' ? 'warning' :
                        msg.role === 'user' ? 'primary' : 'success'
                      }
                    >
                      {msg.role}
                    </Badge>
                    <p className="text-sm flex-1">
                      {typeof msg.content === 'string'
                        ? msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '')
                        : JSON.stringify(msg.content).slice(0, 200)}
                    </p>
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
