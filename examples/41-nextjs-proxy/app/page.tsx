'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';

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
    ready: '#6366f1',
    listening: '#f59e0b',
    thinking: '#8b5cf6',
    speaking: '#10b981',
    error: '#ef4444',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
      color: '#eee',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
        CompositeVoice -- Next.js Proxy
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
        41 -- createNextJsProxy with security config
      </p>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{
          padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '20px',
          color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
        }}>Next.js App Router</span>
        <span style={{
          padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '20px',
          color: '#fde68a', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)',
        }}>Rate Limit + Max Body</span>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', padding: '16px', maxWidth: '600px', width: '100%',
        marginBottom: '2rem', fontSize: '0.85rem', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#a5b4fc' }}>How this works:</strong> The catch-all route at{' '}
        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          app/api/proxy/[...path]/route.ts
        </code>{' '}
        uses <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          createNextJsProxy()
        </code>{' '}
        to forward requests with API keys injected server-side. Rate limited to 60 req/min, max body 512 KB.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <span style={{
          display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
          background: stateColors[state] || '#888', boxShadow: `0 0 8px ${stateColors[state] || '#888'}`,
        }} />
        <span style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{state}</span>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
        <button
          onClick={initialize}
          disabled={state !== 'idle'}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
            background: state === 'idle' ? '#6366f1' : '#333',
            color: state === 'idle' ? '#fff' : '#666',
            cursor: state === 'idle' ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem', fontWeight: 500,
          }}
        >Initialize</button>
        <button
          onClick={start}
          disabled={state !== 'ready'}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
            background: state === 'ready' ? '#4caf50' : '#333',
            color: state === 'ready' ? '#fff' : '#666',
            cursor: state === 'ready' ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem', fontWeight: 500,
          }}
        >Start</button>
        <button
          onClick={stop}
          disabled={!['listening', 'thinking', 'speaking'].includes(state)}
          style={{
            padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
            background: ['listening', 'thinking', 'speaking'].includes(state) ? '#ef4444' : '#333',
            color: ['listening', 'thinking', 'speaking'].includes(state) ? '#fff' : '#666',
            cursor: ['listening', 'thinking', 'speaking'].includes(state) ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem', fontWeight: 500,
          }}
        >Stop</button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(244, 67, 54, 0.15)', border: '1px solid rgba(244, 67, 54, 0.4)',
          borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem',
          maxWidth: '600px', width: '100%', fontSize: '0.875rem', color: '#ff6b6b',
        }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', maxWidth: '800px', width: '100%' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.25rem', minHeight: '120px' }}>
          <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f59e0b', marginBottom: '0.75rem' }}>Transcript</h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: 0, color: '#ccc' }}>
            {transcript || <span style={{ color: '#555' }}>Waiting for speech...</span>}
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.25rem', minHeight: '120px' }}>
          <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8b5cf6', marginBottom: '0.75rem' }}>Response</h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, margin: 0, color: '#ccc' }}>
            {response || <span style={{ color: '#555' }}>Waiting for response...</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
