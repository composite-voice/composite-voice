import React, { useState, useRef, useCallback } from 'react';
import { Button, Card, CardBody, CardTitle, Badge, Alert } from '@lukeocodes/composite-voice-ui';
import type { CompositeVoice, AgentState } from '@lukeocodes/composite-voice';

interface VoiceAgentProps {
  agent: CompositeVoice | null;
  onInit: () => Promise<void>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
}

const STATE_COLORS: Record<string, string> = {
  idle: 'neutral',
  ready: 'primary',
  listening: 'success',
  thinking: 'warning',
  speaking: 'info',
  error: 'danger',
};

export function VoiceAgent({ agent, onInit, onStart, onStop }: VoiceAgentProps) {
  const [state, setState] = useState<AgentState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const handleInit = useCallback(async () => {
    try {
      setError(null);
      await onInit();
      setInitialized(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onInit]);

  const handleStart = useCallback(async () => {
    try {
      setError(null);
      await onStart();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onStart]);

  const handleStop = useCallback(async () => {
    try {
      await onStop();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onStop]);

  // Wire events when agent changes
  React.useEffect(() => {
    if (!agent) return;
    const unsubs = [
      agent.on('agent.stateChange', (e) => setState(e.state)),
      agent.on('transcription.speechFinal', (e) => setTranscript(e.text)),
      agent.on('transcription.interim', (e) => setTranscript(e.text)),
      agent.on('llm.start', () => setResponse('')),
      agent.on('llm.chunk', (e) => setResponse(e.accumulated)),
      agent.on('agent.error', (e) => setError(e.error.message)),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [agent]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Badge variant={STATE_COLORS[state] as any}>{state}</Badge>
        {!initialized ? (
          <Button onClick={handleInit}>Initialize</Button>
        ) : state === 'ready' || state === 'idle' ? (
          <Button onClick={handleStart} variant="primary">Start Listening</Button>
        ) : (
          <Button onClick={handleStop} variant="outline">Stop</Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Card>
          <CardBody>
            <CardTitle>Transcript</CardTitle>
            <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>{transcript || 'Waiting for speech...'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <CardTitle>Response</CardTitle>
            <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>{response || 'Waiting for response...'}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
