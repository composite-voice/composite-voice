'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

export default function Home() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const initialize = useCallback(async () => {
    setError('');
    const agent = new CompositeVoice({
      stt: new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
      llm: new AnthropicLLM({
        proxyUrl: `${window.location.origin}/api/proxy/anthropic`,
        model: 'claude-haiku-4-5-20251001',
        systemPrompt: 'You are a helpful voice assistant. Keep responses to two or three sentences.',
        maxTokens: 200,
      }),
      tts: new NativeTTS({ rate: 1.0, preferLocal: true }),
    });

    agent.on('agent.stateChange', (e) => setState(e.state));
    agent.on('transcription.interim', (e) => { if (e.text.trim()) setTranscript(e.text); });
    agent.on('transcription.final', (e) => { if (e.text.trim()) setTranscript(e.text); });
    agent.on('llm.start', () => setResponse(''));
    agent.on('llm.chunk', (e) => setResponse(prev => prev + e.chunk));
    agent.on('agent.error', (e) => setError(e.error.message));

    try {
      await agent.initialize();
      agentRef.current = agent;
      setState('ready');
    } catch (err) {
      setError(`Init failed: ${(err as Error).message}`);
    }
  }, []);

  const start = useCallback(async () => {
    if (!agentRef.current) return;
    setTranscript('');
    setResponse('');
    setError('');
    try {
      await agentRef.current.start();
    } catch (err) {
      setError(`Start failed: ${(err as Error).message}`);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!agentRef.current) return;
    try {
      await agentRef.current.stop();
    } catch (err) {
      setError(`Stop failed: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.stop().catch(() => {});
        agentRef.current = null;
      }
    };
  }, []);

  const stateColors: Record<string, string> = {
    idle: '#888',
    ready: '#4a9eff',
    listening: '#4caf50',
    thinking: '#ff9800',
    speaking: '#9c27b0',
    error: '#f44336',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      color: '#eee',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
        CompositeVoice — Next.js Proxy
      </h1>
      <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.875rem' }}>
        NativeSTT + AnthropicLLM (via /api/proxy) + NativeTTS
      </p>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <span style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: stateColors[state] || '#888',
          boxShadow: `0 0 8px ${stateColors[state] || '#888'}`,
        }} />
        <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {state}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button
          onClick={initialize}
          disabled={state !== 'idle'}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            background: state === 'idle' ? '#4a9eff' : '#333',
            color: state === 'idle' ? '#fff' : '#666',
            cursor: state === 'idle' ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Initialize
        </button>
        <button
          onClick={start}
          disabled={state !== 'ready'}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            background: state === 'ready' ? '#4caf50' : '#333',
            color: state === 'ready' ? '#fff' : '#666',
            cursor: state === 'ready' ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Start
        </button>
        <button
          onClick={stop}
          disabled={!['listening', 'thinking', 'speaking'].includes(state)}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            border: 'none',
            background: ['listening', 'thinking', 'speaking'].includes(state) ? '#f44336' : '#333',
            color: ['listening', 'thinking', 'speaking'].includes(state) ? '#fff' : '#666',
            cursor: ['listening', 'thinking', 'speaking'].includes(state) ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          Stop
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(244, 67, 54, 0.15)',
          border: '1px solid rgba(244, 67, 54, 0.4)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          maxWidth: '600px',
          width: '100%',
          fontSize: '0.875rem',
          color: '#ff6b6b',
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1.5rem',
        maxWidth: '800px',
        width: '100%',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '1.25rem',
          minHeight: '120px',
        }}>
          <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4caf50', marginBottom: '0.75rem' }}>
            Transcript
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: 0, color: '#ccc' }}>
            {transcript || <span style={{ color: '#555' }}>Waiting for speech...</span>}
          </p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '1.25rem',
          minHeight: '120px',
        }}>
          <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9c27b0', marginBottom: '0.75rem' }}>
            Response
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: 0, color: '#ccc' }}>
            {response || <span style={{ color: '#555' }}>Waiting for response...</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
