import { useState, useRef, useCallback } from 'react';
import { CompositeVoice, AnthropicLLM } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    const voice = new CompositeVoice({
      providers: [
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
        }),
      ],
      logging: { enabled: true, level: 'debug' },
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
      title="First Voice Pipeline"
      description="The simplest voice pipeline: browser-native STT and TTS with Claude as the LLM. No extra API keys beyond Anthropic."
      number="01"
    >
      <VoiceAgent
        agent={agent}
        onInit={handleInit}
        onStart={handleStart}
        onStop={handleStop}
      />
    </ExampleShell>
  );
}
