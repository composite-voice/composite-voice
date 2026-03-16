import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Badge,
  Select,
  Label,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: 'EN' },
  { code: 'en-GB', label: 'English (UK)', flag: 'EN' },
  { code: 'es', label: 'Spanish', flag: 'ES' },
  { code: 'fr', label: 'French', flag: 'FR' },
  { code: 'de', label: 'German', flag: 'DE' },
  { code: 'it', label: 'Italian', flag: 'IT' },
  { code: 'pt', label: 'Portuguese', flag: 'PT' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', flag: 'BR' },
  { code: 'nl', label: 'Dutch', flag: 'NL' },
  { code: 'ja', label: 'Japanese', flag: 'JA' },
  { code: 'ko', label: 'Korean', flag: 'KO' },
  { code: 'zh', label: 'Chinese (Mandarin)', flag: 'ZH' },
  { code: 'hi', label: 'Hindi', flag: 'HI' },
  { code: 'ru', label: 'Russian', flag: 'RU' },
  { code: 'tr', label: 'Turkish', flag: 'TR' },
  { code: 'pl', label: 'Polish', flag: 'PL' },
  { code: 'sv', label: 'Swedish', flag: 'SV' },
  { code: 'da', label: 'Danish', flag: 'DA' },
  { code: 'no', label: 'Norwegian', flag: 'NO' },
  { code: 'fi', label: 'Finnish', flag: 'FI' },
];

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);

  const [language, setLanguage] = useState('en-US');
  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [languageHistory, setLanguageHistory] = useState<string[]>([]);

  const createAgent = useCallback(async (lang: string) => {
    // Dispose existing agent
    if (agentRef.current) {
      try {
        await agentRef.current.stopListening();
        await agentRef.current.dispose();
      } catch {
        // Ignore disposal errors
      }
    }

    const selectedLang = LANGUAGES.find((l) => l.code === lang);
    const langLabel = selectedLang?.label ?? lang;

    const agent = new CompositeVoice({
      providers: [
        new MicrophoneInput({ sampleRate: 16000, format: 'pcm' }),
        new DeepgramSTT({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          options: {
            language: lang,
            model: 'nova-3',
            punctuation: true,
            smartFormat: true,
          },
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: `You are a helpful voice assistant. The user is speaking in ${langLabel}. Respond in the same language (${langLabel}). Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.`,
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0, preferLocal: true }),
      ],
    });

    agent.on('agent.stateChange', (e) => setState(e.state));
    agent.on('transcription.interim', (e) => setTranscript(e.text));
    agent.on('transcription.speechFinal', (e) => setTranscript(e.text));
    agent.on('llm.start', () => setResponse(''));
    agent.on('llm.chunk', (e) => setResponse(e.accumulated));
    agent.on('agent.error', (e) => setError(e.error.message));

    agentRef.current = agent;
    await agent.initialize();

    return agent;
  }, []);

  const handleInit = useCallback(async () => {
    try {
      setError(null);
      await createAgent(language);
      setInitialized(true);
      setLanguageHistory([language]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [language, createAgent]);

  const handleStart = useCallback(async () => {
    try {
      setTranscript('');
      setResponse('');
      await agentRef.current?.startListening();
      setRunning(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
    setRunning(false);
  }, []);

  const handleLanguageChange = useCallback(async (newLang: string) => {
    setLanguage(newLang);
    if (initialized) {
      try {
        setError(null);
        const wasRunning = running;
        if (running) {
          await agentRef.current?.stopListening();
          setRunning(false);
        }
        await createAgent(newLang);
        setLanguageHistory((prev) => [...prev, newLang]);
        if (wasRunning) {
          await agentRef.current?.startListening();
          setRunning(true);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    }
  }, [initialized, running, createAgent]);

  const selectedLang = LANGUAGES.find((l) => l.code === language);

  return (
    <ExampleShell
      title="Multi-Language"
      description="Switch languages at runtime. DeepgramSTT language is reconfigured on the fly and the LLM is instructed to respond in the selected language."
      number="65"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        {/* Language Selector */}
        <Card>
          <CardBody>
            <CardTitle>Language Selection</CardTitle>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="language">Active Language</Label>
                <Select
                  id="language"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.label} ({lang.code})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex gap-2 items-center">
                <span className="text-sm text-foreground-muted">Current:</span>
                <Badge variant="primary">{selectedLang?.label ?? language}</Badge>
                <Badge variant="neutral">{language}</Badge>
              </div>

              {initialized && (
                <Alert variant="info" title="Live Switching">
                  Changing the language will reinitialize the agent with the new
                  DeepgramSTT language setting. The LLM system prompt is also updated
                  to respond in the selected language.
                </Alert>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Controls */}
        <div className="flex gap-2 items-center">
          <Badge
            variant={
              state === 'speaking' ? 'success' :
              state === 'listening' ? 'warning' :
              state === 'thinking' ? 'info' : 'neutral'
            }
          >
            {state}
          </Badge>
          {!initialized ? (
            <Button onClick={handleInit} variant="primary">Initialize</Button>
          ) : !running ? (
            <Button onClick={handleStart} variant="primary">Start Listening</Button>
          ) : (
            <Button onClick={handleStop} variant="outline">Stop</Button>
          )}
        </div>

        {/* Transcript + Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>
                Transcript <Badge variant="neutral">{language}</Badge>
              </CardTitle>
              <p className="text-sm mt-2">{transcript || 'Waiting for speech...'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Response</CardTitle>
              <p className="text-sm mt-2">{response || 'Waiting for response...'}</p>
            </CardBody>
          </Card>
        </div>

        {/* Language History */}
        <Card>
          <CardBody>
            <CardTitle>Language Switch History</CardTitle>
            <div className="flex gap-2 flex-wrap mt-3">
              {languageHistory.map((lang, i) => {
                const l = LANGUAGES.find((x) => x.code === lang);
                return (
                  <Badge key={i} variant={lang === language ? 'primary' : 'neutral'}>
                    {l?.label ?? lang}
                  </Badge>
                );
              })}
              {languageHistory.length === 0 && (
                <p className="text-sm text-foreground-muted">No switches yet</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Code */}
        <Card>
          <CardBody>
            <CardTitle>How to Configure Language</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`// Set language in DeepgramSTT options
new DeepgramSTT({
  proxyUrl: '/proxy/deepgram',
  options: {
    language: '${language}',  // BCP-47 language code
    model: 'nova-3',         // Nova-3 supports 30+ languages
    punctuation: true,
    smartFormat: true,
  },
});

// Instruct the LLM to respond in the same language
new AnthropicLLM({
  systemPrompt: 'Respond in ${selectedLang?.label ?? language}.',
});

// To switch at runtime: dispose + recreate the agent
await agent.dispose();
const newAgent = new CompositeVoice({
  providers: [
    new DeepgramSTT({ options: { language: 'fr' } }),
    // ... other providers
  ],
});
await newAgent.initialize();`} />
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
