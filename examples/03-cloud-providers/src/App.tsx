import { useState, useRef, useCallback } from 'react';
import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    const voice = new CompositeVoice({
      providers: [
        new DeepgramSTT({ proxyUrl: '/proxy/deepgram', interimResults: true }),
        new AnthropicLLM({ proxyUrl: '/proxy/anthropic', model: 'claude-haiku-4-5' }),
        new DeepgramTTS({ proxyUrl: '/proxy/deepgram' }),
      ],
    });
    agentRef.current = voice;
    setAgent(voice);
    await voice.initialize();
  }, []);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Cloud Providers"
      description="Production-quality pipeline: Deepgram for speech recognition and synthesis, Claude for the LLM. Low-latency WebSocket connections."
      number="03"
    >
      <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />
    </ExampleShell>
  );
}
