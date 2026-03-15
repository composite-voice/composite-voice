import { useState, useRef, useCallback } from 'react';
import { CompositeVoice, MicrophoneInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    const PROXY = window.location.origin;
    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new DeepgramSTT({ proxyUrl: `${PROXY}/proxy/deepgram`, interimResults: true }),
        new AnthropicLLM({
          proxyUrl: `${PROXY}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
        }),
        new DeepgramTTS({ proxyUrl: `${PROXY}/proxy/deepgram` }),
        new BrowserAudioOutput(),
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
      title="Cloud Providers"
      description="Production-quality pipeline: Deepgram for speech recognition and synthesis, Claude for the LLM. Low-latency WebSocket connections."
      number="03"
    >
      <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />
    </ExampleShell>
  );
}
