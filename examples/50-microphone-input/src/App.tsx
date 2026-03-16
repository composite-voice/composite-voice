import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';
import type { AudioInputConfig } from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import {
  Card,
  CardBody,
  CardTitle,
  Badge,
  Label,
  Input,
  Checkbox,
  Select,
  Alert,
  ProgressBar,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

const SAMPLE_RATES = [8000, 16000, 24000, 44100, 48000];
const FORMATS = ['pcm', 'opus', 'mp3', 'wav', 'webm'];
const CHUNK_DURATIONS = [20, 50, 100, 150, 250];

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  // AudioInputConfig state
  const [sampleRate, setSampleRate] = useState(16000);
  const [format, setFormat] = useState<string>('pcm');
  const [channels, setChannels] = useState(1);
  const [chunkDuration, setChunkDuration] = useState(100);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);

  // Audio level meter
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Config display
  const currentConfig: AudioInputConfig = {
    sampleRate,
    format: format as AudioInputConfig['format'],
    channels,
    chunkDuration,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
  };

  const startAudioMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation,
          noiseSuppression,
          autoGainControl,
          sampleRate: { ideal: sampleRate },
          channelCount: channels,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate });
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]!;
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, (avg / 128) * 100));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Microphone not available
    }
  }, [sampleRate, channels, echoCancellation, noiseSuppression, autoGainControl]);

  const stopAudioMeter = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => stopAudioMeter();
  }, [stopAudioMeter]);

  const handleInit = useCallback(async () => {
    const newAgent = new CompositeVoice({
      providers: [
        new MicrophoneInput({
          sampleRate,
          format: format as AudioInputConfig['format'],
          channels,
          chunkDuration,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        }),
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
          maxTokens: 200,
        }),
        new NativeTTS({ rate: 1.0, preferLocal: true }),
      ],
    });

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
    await startAudioMeter();
  }, [sampleRate, format, channels, chunkDuration, echoCancellation, noiseSuppression, autoGainControl, startAudioMeter]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
    stopAudioMeter();
  }, [stopAudioMeter]);

  return (
    <ExampleShell
      title="Microphone Input Deep-Dive"
      description="Explore all AudioInputConfig options: sampleRate, format, channels, chunkDuration, echoCancellation, noiseSuppression, autoGainControl. Adjust settings before initializing."
      number="50"
    >
      <div className="space-y-6">
        {/* Audio Level Meter */}
        <Card>
          <CardBody>
            <CardTitle>Real-Time Audio Level</CardTitle>
            <div className="mt-3">
              <ProgressBar value={audioLevel} max={100} />
              <p className="text-sm text-foreground-muted mt-1">
                Level: {audioLevel.toFixed(1)}%
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Config Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Audio Format</CardTitle>
              <div className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="sampleRate">Sample Rate (Hz)</Label>
                  <Select
                    id="sampleRate"
                    value={String(sampleRate)}
                    onChange={(e) => setSampleRate(Number(e.target.value))}
                  >
                    {SAMPLE_RATES.map((r) => (
                      <option key={r} value={r}>{r.toLocaleString()} Hz</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="format">Format</Label>
                  <Select
                    id="format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="channels">Channels</Label>
                  <Select
                    id="channels"
                    value={String(channels)}
                    onChange={(e) => setChannels(Number(e.target.value))}
                  >
                    <option value="1">1 (Mono)</option>
                    <option value="2">2 (Stereo)</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="chunkDuration">
                    Chunk Duration: {chunkDuration}ms
                  </Label>
                  <Input
                    id="chunkDuration"
                    type="range"
                    min={20}
                    max={250}
                    step={10}
                    value={chunkDuration}
                    onChange={(e) => setChunkDuration(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-foreground-muted">
                    <span>20ms (low latency)</span>
                    <span>250ms (fewer chunks)</span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle>Browser Audio Processing</CardTitle>
              <div className="space-y-3 mt-3">
                <Checkbox
                  checked={echoCancellation}
                  onChange={(e) => setEchoCancellation(e.target.checked)}
                  label="Echo Cancellation"
                />
                <p className="text-xs text-foreground-muted ml-6">
                  Prevents TTS audio from being re-transcribed by STT
                </p>

                <Checkbox
                  checked={noiseSuppression}
                  onChange={(e) => setNoiseSuppression(e.target.checked)}
                  label="Noise Suppression"
                />
                <p className="text-xs text-foreground-muted ml-6">
                  Reduces background noise for cleaner transcriptions
                </p>

                <Checkbox
                  checked={autoGainControl}
                  onChange={(e) => setAutoGainControl(e.target.checked)}
                  label="Auto Gain Control"
                />
                <p className="text-xs text-foreground-muted ml-6">
                  Normalizes microphone volume for varying distances
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Current Config Display */}
        <Card>
          <CardBody>
            <CardTitle>
              Current Configuration <Badge variant="neutral">AudioInputConfig</Badge>
            </CardTitle>
            <div className="mt-3">
              <CodeBlock language="json" code={JSON.stringify(currentConfig, null, 2)} />
            </div>
          </CardBody>
        </Card>

        <Alert variant="info" title="Note">
          Adjust settings above before clicking Initialize. Changes require re-initialization
          to take effect because microphone constraints are set at capture start.
        </Alert>

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
