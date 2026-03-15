import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';
import type { AudioOutputConfig } from '@lukeocodes/composite-voice';
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
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

const BUFFER_SIZES = [1024, 2048, 4096, 8192, 16384];

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);

  // AudioOutputConfig state
  const [bufferSize, setBufferSize] = useState(4096);
  const [minBufferDuration, setMinBufferDuration] = useState(200);
  const [sampleRate, setSampleRate] = useState(24000);
  const [enableSmoothing, setEnableSmoothing] = useState(true);

  // Playback state
  const [playbackState, setPlaybackState] = useState<string>('idle');
  const [chunksReceived, setChunksReceived] = useState(0);

  const currentConfig: AudioOutputConfig = {
    bufferSize,
    minBufferDuration,
    sampleRate,
    enableSmoothing,
  };

  const handleInit = useCallback(async () => {
    const output = new BrowserAudioOutput({
      bufferSize,
      minBufferDuration,
      sampleRate,
      enableSmoothing,
    });

    const agent = new CompositeVoice({
      providers: [
        new NativeSTT({
          language: 'en-US',
          continuous: true,
          interimResults: true,
        }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt: 'You are a helpful voice assistant. Keep responses to two or three sentences.',
          maxTokens: 200,
        }),
        new DeepgramTTS({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          model: 'aura-asteria-en',
        }),
        output,
      ],
    });

    agent.on('tts.audio', () => setChunksReceived((c) => c + 1));
    agent.on('audio.playback.start', () => setPlaybackState('playing'));
    agent.on('audio.playback.end', () => {
      setPlaybackState('idle');
      setChunksReceived(0);
    });
    agent.on('tts.start', () => {
      setPlaybackState('buffering');
      setChunksReceived(0);
    });

    agentRef.current = agent;
    await agent.initialize();
  }, [bufferSize, minBufferDuration, sampleRate, enableSmoothing]);

  const handleStart = useCallback(async () => {
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  return (
    <ExampleShell
      title="Browser Audio Output Deep-Dive"
      description="Explore all AudioOutputConfig options for BrowserAudioOutput. Adjust bufferSize, minBufferDuration, sampleRate, and enableSmoothing."
      number="52"
    >
      <div className="space-y-6">
        {/* Playback Status */}
        <Card>
          <CardBody>
            <CardTitle>Playback Status</CardTitle>
            <div className="flex gap-3 items-center mt-3">
              <Badge
                variant={
                  playbackState === 'playing' ? 'success' :
                  playbackState === 'buffering' ? 'warning' : 'neutral'
                }
              >
                {playbackState}
              </Badge>
              <span className="text-sm text-foreground-muted">
                Audio chunks received: {chunksReceived}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* Config Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Buffer Settings</CardTitle>
              <div className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="bufferSize">Buffer Size (samples)</Label>
                  <Select
                    id="bufferSize"
                    value={String(bufferSize)}
                    onChange={(e) => setBufferSize(Number(e.target.value))}
                  >
                    {BUFFER_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s.toLocaleString()} samples
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-foreground-muted mt-1">
                    Larger = fewer glitches, more latency
                  </p>
                </div>

                <div>
                  <Label htmlFor="minBuffer">
                    Min Buffer Duration: {minBufferDuration}ms
                  </Label>
                  <Input
                    id="minBuffer"
                    type="range"
                    min={0}
                    max={500}
                    step={25}
                    value={minBufferDuration}
                    onChange={(e) => setMinBufferDuration(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-foreground-muted">
                    <span>0ms (instant start)</span>
                    <span>500ms (smoother)</span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <CardTitle>Audio Quality</CardTitle>
              <div className="space-y-3 mt-3">
                <div>
                  <Label htmlFor="outputSampleRate">Output Sample Rate (Hz)</Label>
                  <Select
                    id="outputSampleRate"
                    value={String(sampleRate)}
                    onChange={(e) => setSampleRate(Number(e.target.value))}
                  >
                    <option value="16000">16,000 Hz</option>
                    <option value="24000">24,000 Hz</option>
                    <option value="44100">44,100 Hz</option>
                    <option value="48000">48,000 Hz</option>
                  </Select>
                </div>

                <Checkbox
                  checked={enableSmoothing}
                  onChange={(e) => setEnableSmoothing(e.target.checked)}
                  label="Enable Smoothing"
                />
                <p className="text-xs text-foreground-muted ml-6">
                  Crossfades between chunks to eliminate clicks at boundaries
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Config Display */}
        <Card>
          <CardBody>
            <CardTitle>
              Current Configuration <Badge variant="neutral">AudioOutputConfig</Badge>
            </CardTitle>
            <div className="mt-3">
              <CodeBlock language="json">
                {JSON.stringify(currentConfig, null, 2)}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>

        <Alert variant="info" title="Note">
          Adjust settings before initializing. Uses DeepgramTTS for WebSocket-based
          streaming audio output so you can observe buffering and smoothing behavior.
        </Alert>

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
