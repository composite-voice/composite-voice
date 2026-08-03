import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  DeepgramTTS,
  NullOutput,
} from 'composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Alert,
  CodeBlock,
} from 'composite-voice-ui';

interface TTSEvent {
  id: number;
  type: string;
  timestamp: string;
  detail: string;
}

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);
  const eventIdRef = useRef(0);

  const [ttsEvents, setTtsEvents] = useState<TTSEvent[]>([]);
  const [audioChunksDiscarded, setAudioChunksDiscarded] = useState(0);
  const [totalBytesDiscarded, setTotalBytesDiscarded] = useState(0);

  const addEvent = useCallback((type: string, detail: string) => {
    const event: TTSEvent = {
      id: ++eventIdRef.current,
      type,
      timestamp: new Date().toISOString().split('T')[1]!.slice(0, 12),
      detail,
    };
    setTtsEvents((prev) => [...prev.slice(-50), event]);
  }, []);

  const handleInit = useCallback(async () => {
    const newAgent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
        }),
        new DeepgramTTS({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          model: 'aura-asteria-en',
        }),
        new NullOutput(),
      ],
    });

    // Track TTS events
    newAgent.on('tts.start', (e) => {
      addEvent('tts.start', `Synthesis started: "${(e as any).text?.slice(0, 60) ?? ''}..."`);
    });
    newAgent.on('tts.audio', (e) => {
      const bytes = (e as any).chunk?.data?.byteLength ?? 0;
      setAudioChunksDiscarded((c) => c + 1);
      setTotalBytesDiscarded((b) => b + bytes);
      addEvent('tts.audio', `Audio chunk discarded: ${bytes} bytes`);
    });
    newAgent.on('tts.complete', () => {
      addEvent('tts.complete', 'Synthesis complete (audio never played)');
    });
    newAgent.on('tts.error', (e) => {
      addEvent('tts.error', `Error: ${e.error?.message ?? 'unknown'}`);
    });
    newAgent.on('llm.complete', () => {
      addEvent('llm.complete', 'LLM response complete, TTS synthesis should follow');
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [addEvent]);

  const handleStart = useCallback(async () => {
    setTtsEvents([]);
    setAudioChunksDiscarded(0);
    setTotalBytesDiscarded(0);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Null Output"
      description="NullOutput discards all audio for headless/testing scenarios. TTS events fire normally, but no sound is played."
      number="53"
    >
      <div className="space-y-6">
        <Alert variant="warning" title="No Audio Playback">
          This example uses NullOutput. You will see TTS events fire and audio chunks
          generated, but no sound will come from your speakers. This is intentional.
        </Alert>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Chunks Discarded</CardTitle>
              <p className="text-2xl font-bold mt-2">{audioChunksDiscarded}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Bytes Discarded</CardTitle>
              <p className="text-2xl font-bold mt-2">
                {(totalBytesDiscarded / 1024).toFixed(1)} KB
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Events Logged</CardTitle>
              <p className="text-2xl font-bold mt-2">{ttsEvents.length}</p>
            </CardBody>
          </Card>
        </div>

        {/* Code Example */}
        <Card>
          <CardBody>
            <CardTitle>
              Usage <Badge variant="neutral">NullOutput</Badge>
            </CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`import { NullOutput } from 'composite-voice';

// NullOutput implements AudioOutputProvider as a null sink.
// All methods are no-ops — audio is silently discarded.
const agent = new CompositeVoice({
  providers: [
    new NativeSTT(),
    new AnthropicLLM({ ... }),
    new DeepgramTTS({ ... }),
    new NullOutput(),  // Audio generated but never played
  ],
});

// TTS events still fire normally:
agent.on('tts.start', () => { /* synthesis started */ });
agent.on('tts.audio', () => { /* chunk generated */ });
agent.on('tts.complete', () => { /* synthesis done */ });`} />
            </div>
          </CardBody>
        </Card>

        {/* TTS Event Log */}
        <Card>
          <CardBody>
            <CardTitle>TTS Event Log</CardTitle>
            <div
              className="mt-3 max-h-64 overflow-y-auto font-mono text-xs"
              style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '12px' }}
            >
              {ttsEvents.length === 0 ? (
                <p className="text-foreground-muted">Events will appear here once the agent is running...</p>
              ) : (
                ttsEvents.map((evt) => (
                  <div key={evt.id} className="flex gap-2 py-0.5">
                    <span className="text-foreground-muted flex-shrink-0">{evt.timestamp}</span>
                    <Badge variant={evt.type.includes('error') ? 'danger' : 'neutral'} >
                      {evt.type}
                    </Badge>
                    <span className="text-foreground-muted truncate">{evt.detail}</span>
                  </div>
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
