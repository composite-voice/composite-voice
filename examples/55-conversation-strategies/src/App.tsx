import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from 'composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Badge,
  Alert,
  CodeBlock,
} from 'composite-voice-ui';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

interface AgentPanel {
  label: string;
  maxTurns: number;
  agent: CompositeVoice | null;
  state: string;
  turns: Turn[];
  currentTranscript: string;
  currentResponse: string;
}

export default function App() {
  const [panels, setPanels] = useState<AgentPanel[]>([
    { label: 'Short Memory (maxTurns=3)', maxTurns: 3, agent: null, state: 'idle', turns: [], currentTranscript: '', currentResponse: '' },
    { label: 'Long Memory (maxTurns=10)', maxTurns: 10, agent: null, state: 'idle', turns: [], currentTranscript: '', currentResponse: '' },
  ]);
  const [initialized, setInitialized] = useState(false);
  const [activeAgent, setActiveAgent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agentsRef = useRef<(CompositeVoice | null)[]>([null, null]);

  const updatePanel = useCallback((index: number, updates: Partial<AgentPanel>) => {
    setPanels((prev) => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  }, []);

  const handleInit = useCallback(async () => {
    try {
      setError(null);
      for (let i = 0; i < 2; i++) {
        const panel = panels[i]!;
        const agent = new CompositeVoice({
          providers: [
            new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
            new AnthropicLLM({
              proxyUrl: `${window.location.origin}/proxy/anthropic`,
              model: 'claude-haiku-4-5-20251001',
              systemPrompt: `You are a helpful voice assistant. Respond in plain text only — no markdown. You have a conversation memory of ${panel.maxTurns} turns.`,
              maxTokens: 200,
            }),
            new NativeTTS({ rate: 1.0, preferLocal: true }),
          ],
          conversationHistory: {
            enabled: true,
            maxTurns: panel.maxTurns,
          },
        });

        const idx = i;
        agent.on('agent.stateChange', (e) => updatePanel(idx, { state: e.state }));
        agent.on('transcription.interim', (e) => updatePanel(idx, { currentTranscript: e.text }));
        agent.on('transcription.speechFinal', (e) => {
          updatePanel(idx, { currentTranscript: e.text });
          setPanels((prev) => prev.map((p, j) =>
            j === idx ? { ...p, turns: [...p.turns, { role: 'user', text: e.text }] } : p
          ));
        });
        agent.on('llm.start', () => updatePanel(idx, { currentResponse: '' }));
        agent.on('llm.chunk', (e) => updatePanel(idx, { currentResponse: e.accumulated }));
        agent.on('llm.complete', (e) => {
          setPanels((prev) => prev.map((p, j) =>
            j === idx ? { ...p, turns: [...p.turns, { role: 'assistant', text: e.text }] } : p
          ));
        });
        agent.on('agent.error', (e) => setError(e.error.message));

        agentsRef.current[i] = agent;
        await agent.initialize();
        updatePanel(i, { agent });
      }
      setInitialized(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [panels, updatePanel]);

  const handleStartAgent = useCallback(async (index: number) => {
    try {
      // Stop the other agent if running
      if (activeAgent !== null && activeAgent !== index) {
        await agentsRef.current[activeAgent]?.stopListening();
      }
      await agentsRef.current[index]?.startListening();
      setActiveAgent(index);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [activeAgent]);

  const handleStop = useCallback(async () => {
    if (activeAgent !== null) {
      await agentsRef.current[activeAgent]?.stopListening();
      setActiveAgent(null);
    }
  }, [activeAgent]);

  return (
    <ExampleShell
      title="Conversation History Strategies"
      description="Side-by-side comparison of conversation history with different maxTurns settings. Watch how history grows and trims differently."
      number="55"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        <Alert variant="info" title="How it works">
          Both agents share the same providers but have different maxTurns settings.
          Speak to each agent and observe how the short-memory agent forgets earlier
          turns while the long-memory agent retains more context.
        </Alert>

        {/* Controls */}
        <div className="flex gap-2 items-center">
          {!initialized ? (
            <Button onClick={handleInit} variant="primary">Initialize Both Agents</Button>
          ) : (
            <>
              <Button
                onClick={() => handleStartAgent(0)}
                variant={activeAgent === 0 ? 'primary' : 'outline'}
                disabled={activeAgent === 0}
              >
                Speak to Short Memory
              </Button>
              <Button
                onClick={() => handleStartAgent(1)}
                variant={activeAgent === 1 ? 'primary' : 'outline'}
                disabled={activeAgent === 1}
              >
                Speak to Long Memory
              </Button>
              {activeAgent !== null && (
                <Button onClick={handleStop} variant="outline">Stop</Button>
              )}
            </>
          )}
        </div>

        {/* Side by side panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {panels.map((panel, idx) => (
            <Card key={idx}>
              <CardBody>
                <CardTitle>
                  {panel.label}
                  <Badge
                    variant={activeAgent === idx ? 'success' : 'neutral'}
                    className="ml-2"
                  >
                    {panel.state}
                  </Badge>
                </CardTitle>

                {/* Config */}
                <div className="mt-2 text-xs text-foreground-muted">
                  maxTurns: {panel.maxTurns} | Active turns: {Math.ceil(panel.turns.length / 2)} |
                  Visible: {Math.min(Math.ceil(panel.turns.length / 2), panel.maxTurns)} retained
                </div>

                {/* Conversation History */}
                <div
                  className="mt-3 max-h-64 overflow-y-auto space-y-2"
                  style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
                >
                  {panel.turns.length === 0 && !panel.currentTranscript ? (
                    <p className="text-sm text-foreground-muted">No conversation yet...</p>
                  ) : (
                    <>
                      {panel.turns.map((turn, tIdx) => {
                        // Show which turns would be trimmed
                        const turnNumber = Math.floor(tIdx / 2);
                        const totalTurns = Math.ceil(panel.turns.length / 2);
                        const isTrimmed = turnNumber < totalTurns - panel.maxTurns;

                        return (
                          <div
                            key={tIdx}
                            className="text-sm"
                            style={{ opacity: isTrimmed ? 0.3 : 1 }}
                          >
                            <Badge variant={turn.role === 'user' ? 'info' : 'success'}>
                              {turn.role}
                            </Badge>
                            {isTrimmed && <Badge variant="danger" className="ml-1">trimmed</Badge>}
                            <p className="mt-1">{turn.text}</p>
                          </div>
                        );
                      })}
                      {panel.currentTranscript && activeAgent === idx && (
                        <div className="text-sm opacity-60">
                          <Badge variant="info">user</Badge>
                          <p className="mt-1 italic">{panel.currentTranscript}</p>
                        </div>
                      )}
                      {panel.currentResponse && activeAgent === idx && (
                        <div className="text-sm opacity-60">
                          <Badge variant="success">assistant</Badge>
                          <p className="mt-1 italic">{panel.currentResponse}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Configuration Code */}
        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`// Short memory — forgets after 3 turns
const shortMemory = new CompositeVoice({
  providers: [...],
  conversationHistory: {
    enabled: true,
    maxTurns: 3,  // Retains last 3 user+assistant pairs
  },
});

// Long memory — retains 10 turns
const longMemory = new CompositeVoice({
  providers: [...],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,
    // Optional: preserveSystemMessages: true (default)
    // Optional: maxTokens: 4000 (token budget limit)
  },
});`} />
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
