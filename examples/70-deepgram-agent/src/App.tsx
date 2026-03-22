import { useState, useRef, useCallback } from 'react';
import { CompositeVoice, DeepgramAgent } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    const PROXY = window.location.origin;
    const voice = new CompositeVoice({
      providers: [
        new DeepgramAgent({
          proxyUrl: `${PROXY}/proxy/deepgramAgent`,
          think: {
            provider: { type: 'open_ai', model: 'gpt-4o-mini' },
            prompt: 'You are a friendly voice assistant. Keep your responses concise and conversational.',
            functions: [
              {
                name: 'get_time',
                description: 'Get the current time',
                parameters: { type: 'object', properties: {} },
              },
            ],
          },
          speak: {
            provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
          },
          greeting: 'Hello! I am a Deepgram voice agent. How can I help you today?',
          experimental: true,
          onFunctionCall: async (call) => {
            if (call.name === 'get_time') {
              return { content: new Date().toLocaleTimeString() };
            }
            return { content: 'Unknown function' };
          },
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
      title="Deepgram Agent"
      description="Single-WebSocket voice agent: Deepgram handles STT, LLM (OpenAI), and TTS server-side. One provider replaces the entire pipeline."
      number="70"
    >
      <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />
    </ExampleShell>
  );
}
