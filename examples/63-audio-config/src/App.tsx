import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

interface ChunkStat {
  timestamp: number;
  byteLength: number;
  sequence: number;
}

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);

  // Audio environment detection
  const [audioWorkletSupported, setAudioWorkletSupported] = useState<boolean | null>(null);
  const [scriptProcessorDeprecated] = useState(true);
  const [audioContextState, setAudioContextState] = useState<string>('unknown');
  const [sampleRateActual, setSampleRateActual] = useState<number>(0);
  const [baseLatency, setBaseLatency] = useState<number>(0);
  const [outputLatency, setOutputLatency] = useState<number>(0);

  // Chunk stats
  const [chunkStats, setChunkStats] = useState<ChunkStat[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [avgChunkSize, setAvgChunkSize] = useState(0);
  const [chunksPerSecond, setChunksPerSecond] = useState(0);

  // Detect audio capabilities
  useEffect(() => {
    const detect = async () => {
      // Check AudioWorklet support
      try {
        const ctx = new AudioContext();
        setAudioWorkletSupported(typeof ctx.audioWorklet !== 'undefined');
        setAudioContextState(ctx.state);
        setSampleRateActual(ctx.sampleRate);
        setBaseLatency((ctx as any).baseLatency ?? 0);
        setOutputLatency((ctx as any).outputLatency ?? 0);
        await ctx.close();
      } catch {
        setAudioWorkletSupported(false);
      }
    };
    detect();
  }, []);

  const handleInit = useCallback(async () => {
    const agent = new CompositeVoice({
      providers: [
        new MicrophoneInput({
          sampleRate: 16000,
          format: 'pcm',
          channels: 1,
          chunkDuration: 100,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }),
        new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Keep responses to two or three sentences.',
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0, preferLocal: true }),
      ],
    });

    // Track audio chunks for stats
    let startTime = 0;
    let chunkCount = 0;
    let byteCount = 0;

    agent.on('audio.capture.start', () => {
      startTime = Date.now();
      chunkCount = 0;
      byteCount = 0;
      setChunkStats([]);
      setTotalChunks(0);
      setTotalBytes(0);
    });

    // Use a proxy event to track audio chunks
    const origInterval = setInterval(() => {
      if (chunkCount > 0 && startTime > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        setChunksPerSecond(elapsed > 0 ? chunkCount / elapsed : 0);
        setAvgChunkSize(byteCount / chunkCount);
      }
    }, 500);

    agentRef.current = agent;
    await agent.initialize();

    return () => clearInterval(origInterval);
  }, []);

  const handleStart = useCallback(async () => {
    setChunkStats([]);
    setTotalChunks(0);
    setTotalBytes(0);
    setChunksPerSecond(0);
    setAvgChunkSize(0);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Audio Config Internals"
      description="Deep-dive into AudioCapture internals. Detect AudioWorklet vs ScriptProcessor, display AudioContext properties, and track audio chunk statistics."
      number="63"
    >
      <div className="space-y-6">
        {/* Audio Environment Detection */}
        <Card>
          <CardBody>
            <CardTitle>Audio Environment Detection</CardTitle>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
              <div>
                <p className="text-sm text-foreground-muted">AudioWorklet</p>
                <Badge variant={audioWorkletSupported ? 'success' : 'danger'}>
                  {audioWorkletSupported === null ? 'Detecting...' :
                   audioWorkletSupported ? 'Supported' : 'Not Supported'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">ScriptProcessor</p>
                <Badge variant="warning">
                  {scriptProcessorDeprecated ? 'Deprecated (fallback)' : 'Available'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Active Path</p>
                <Badge variant="primary">
                  {audioWorkletSupported ? 'AudioWorklet' : 'ScriptProcessor'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Device Sample Rate</p>
                <p className="text-lg font-bold">{sampleRateActual.toLocaleString()} Hz</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Base Latency</p>
                <p className="text-lg font-bold">{(baseLatency * 1000).toFixed(2)} ms</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Output Latency</p>
                <p className="text-lg font-bold">{(outputLatency * 1000).toFixed(2)} ms</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {audioWorkletSupported === false && (
          <Alert variant="warning" title="AudioWorklet Not Available">
            Your browser does not support AudioWorklet. The SDK will fall back to the
            deprecated ScriptProcessorNode. For best performance, use Chrome or Edge.
          </Alert>
        )}

        {/* Chunk Statistics */}
        <Card>
          <CardBody>
            <CardTitle>Audio Chunk Statistics</CardTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div>
                <p className="text-sm text-foreground-muted">Total Chunks</p>
                <p className="text-2xl font-bold">{totalChunks}</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Total Data</p>
                <p className="text-2xl font-bold">{(totalBytes / 1024).toFixed(1)} KB</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Avg Chunk Size</p>
                <p className="text-2xl font-bold">{avgChunkSize.toFixed(0)} B</p>
              </div>
              <div>
                <p className="text-sm text-foreground-muted">Chunks/sec</p>
                <p className="text-2xl font-bold">{chunksPerSecond.toFixed(1)}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* How AudioCapture Works */}
        <Card>
          <CardBody>
            <CardTitle>How AudioCapture Works</CardTitle>
            <div className="mt-3">
              <CodeBlock language="text">
{`Microphone
    |
    v
getUserMedia({ audio: constraints })
    |
    v
MediaStream
    |
    v
AudioContext.createMediaStreamSource(stream)
    |
    v
[AudioWorklet path]           [ScriptProcessor path]
AudioWorkletNode               ScriptProcessorNode
  pcm-capture-processor          onaudioprocess callback
  posts Float32Array chunks      reads inputBuffer channels
    |                                |
    v                                v
Resample to target sampleRate (if needed)
    |
    v
Convert Float32 -> Int16 (linear16)
    |
    v
ArrayBuffer chunks -> onAudio callback
    |
    v
InputQueue -> STT Provider`}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>

        {/* MicrophoneInput Config */}
        <Card>
          <CardBody>
            <CardTitle>MicrophoneInput Configuration Used</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript">
{`new MicrophoneInput({
  sampleRate: 16000,        // Target capture rate (may resample)
  format: 'pcm',            // Raw PCM output
  channels: 1,              // Mono (recommended for speech)
  chunkDuration: 100,       // 100ms chunks -> 3200 bytes each
  echoCancellation: true,   // Prevents TTS feedback loop
  noiseSuppression: true,   // Reduces background noise
  autoGainControl: true,    // Normalizes volume levels
})`}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>

        {/* Voice Agent */}
        <VoiceAgent
          agent={agentRef.current}
          onInit={handleInit}
          onStart={handleStart}
          onStop={handleStop}
        />
      </div>
    </ExampleShell>
  );
}
