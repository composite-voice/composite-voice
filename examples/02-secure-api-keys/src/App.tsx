import { useState, useRef, useCallback } from 'react';
import { CompositeVoice, MicrophoneInput, SpeechmaticsSTT, AnthropicLLM, SpeechifyTTS, BrowserAudioOutput } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [agent, setAgent] = useState<CompositeVoice | null>(null);

  const handleInit = useCallback(async () => {
    const PROXY = 'http://localhost:3001';
    const voice = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new SpeechmaticsSTT({ proxyUrl: `${PROXY}/proxy/speechmatics` }),
        new AnthropicLLM({
          proxyUrl: `${PROXY}/proxy/anthropic`,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
        }),
        new SpeechifyTTS({ proxyUrl: `${PROXY}/proxy/speechify`, voiceId: 'geffen_32' }),
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
      title="Secure API Keys"
      description="API keys stay server-side. The browser connects through an Express proxy that injects real keys before forwarding to providers."
      number="02"
    >
      <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />
    </ExampleShell>
  );
}
