import React, { useState, useRef, useCallback } from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Badge,
  Select,
  Label,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  MicrophoneInput,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';

type AuthType = 'token' | 'bearer';

export default function App() {
  const [authType, setAuthType] = useState<AuthType>('token');
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  const proxyUrl = `${window.location.origin}/proxy/deepgram`;
  const anthropicProxyUrl = `${window.location.origin}/proxy/anthropic`;

  const configSnippet = `// DeepgramSTT provider config
new DeepgramSTT({
  proxyUrl: '${proxyUrl}',
  authType: '${authType}',
  // endpoint: 'wss://custom-endpoint.example.com',
})

// AnthropicLLM provider config
new AnthropicLLM({
  proxyUrl: '${anthropicProxyUrl}',
  model: 'claude-haiku-4-5',
  // endpoint: 'https://custom-anthropic.example.com',
})

// DeepgramTTS provider config
new DeepgramTTS({
  proxyUrl: '${proxyUrl}',
  authType: '${authType}',
})`;

  const connectionInfo = {
    stt: {
      provider: 'DeepgramSTT',
      proxyUrl,
      authType,
      endpoint: 'wss://api.deepgram.com (via proxy)',
      transport: 'WebSocket',
    },
    llm: {
      provider: 'AnthropicLLM',
      proxyUrl: anthropicProxyUrl,
      authType: 'n/a (REST provider, auth via proxy headers)',
      endpoint: 'https://api.anthropic.com (via proxy)',
      transport: 'HTTP SSE streaming',
    },
    tts: {
      provider: 'DeepgramTTS',
      proxyUrl,
      authType,
      endpoint: 'wss://api.deepgram.com (via proxy)',
      transport: 'WebSocket',
    },
  };

  const handleInit = useCallback(async () => {
    if (agentRef.current) {
      await agentRef.current.dispose();
    }

    const newAgent = new CompositeVoice({
      providers: [
        new MicrophoneInput(),
        new DeepgramSTT({
          proxyUrl,
          authType,
        }),
        new AnthropicLLM({
          proxyUrl: anthropicProxyUrl,
          model: 'claude-haiku-4-5',
          systemPrompt: 'You are a helpful voice assistant. Keep responses to two or three sentences.',
          maxTokens: 200,
        }),
        new DeepgramTTS({
          proxyUrl,
          authType,
        }),
        new BrowserAudioOutput(),
      ],
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [authType, proxyUrl, anthropicProxyUrl]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const handleAuthTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setAuthType(e.target.value as AuthType);
    // Agent will be rebuilt on next init
    if (agentRef.current) {
      agentRef.current.dispose();
      agentRef.current = null;
      setAgent(null);
    }
  }, []);

  return (
    <ExampleShell
      title="Base Provider Options"
      description="Configure endpoint, authType, and proxyUrl on provider instances. Toggle authType and see the resolved connection info."
      number="04"
    >
      <div className="space-y-6">
        {/* Auth Type Control */}
        <Card>
          <CardBody>
            <CardTitle>Authentication Type</CardTitle>
            <CardDescription>
              Controls how WebSocket providers authenticate. REST providers (AnthropicLLM) ignore this field.
            </CardDescription>
            <div className="mt-4 max-w-xs">
              <Label htmlFor="auth-type">authType</Label>
              <Select
                id="auth-type"
                value={authType}
                onChange={handleAuthTypeChange}
                options={[
                  { value: 'token', label: "token — Authorization: Token <key>" },
                  { value: 'bearer', label: "bearer — Authorization: Bearer <key>" },
                ]}
              />
            </div>
            <div className="mt-3">
              <Badge variant={authType === 'token' ? 'primary' : 'warning'}>
                Active: {authType}
              </Badge>
            </div>
          </CardBody>
        </Card>

        {/* Connection Info */}
        <Card>
          <CardBody>
            <CardTitle>Resolved Connection Info</CardTitle>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(connectionInfo).map(([role, info]) => (
                <Card key={role} variant="outlined">
                  <CardBody>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="neutral">{role.toUpperCase()}</Badge>
                      <span className="text-sm font-medium">{info.provider}</span>
                    </div>
                    <dl className="space-y-1 text-xs">
                      <div>
                        <dt className="text-foreground-muted">proxyUrl</dt>
                        <dd className="font-mono truncate">{info.proxyUrl}</dd>
                      </div>
                      <div>
                        <dt className="text-foreground-muted">authType</dt>
                        <dd className="font-mono">{info.authType}</dd>
                      </div>
                      <div>
                        <dt className="text-foreground-muted">endpoint</dt>
                        <dd className="font-mono truncate">{info.endpoint}</dd>
                      </div>
                      <div>
                        <dt className="text-foreground-muted">transport</dt>
                        <dd className="font-mono">{info.transport}</dd>
                      </div>
                    </dl>
                  </CardBody>
                </Card>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Config Snippet */}
        <Card>
          <CardBody>
            <CardTitle>Configuration Code</CardTitle>
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
      </div>
    </ExampleShell>
  );
}
