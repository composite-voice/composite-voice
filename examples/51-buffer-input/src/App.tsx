import React, { useState, useRef, useCallback } from 'react';
import {
  CompositeVoice,
  BufferInput,
  NativeSTT,
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
  Alert,
  CodeBlock,
  ProgressBar,
} from '@lukeocodes/composite-voice-ui';

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const bufferInputRef = useRef<BufferInput | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<string>('idle');

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer;
      setAudioBuffer(buffer);
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsArrayBuffer(file);
  }, []);

  const handleInit = useCallback(async () => {
    try {
      setError(null);

      const bufferInput = new BufferInput({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      bufferInputRef.current = bufferInput;

      const agent = new CompositeVoice({
        providers: [
          bufferInput,
          new NativeSTT({
            language: 'en-US',
            continuous: true,
            interimResults: true,
          }),
          new AnthropicLLM({
            proxyUrl: `${window.location.origin}/proxy/anthropic`,
            model: 'claude-haiku-4-5-20251001',
            systemPrompt: 'You are a helpful voice assistant. Describe what you heard in the audio. Respond in plain text only — no markdown. Keep responses brief.',
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
      setInitialized(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!audioBuffer || !agentRef.current || !bufferInputRef.current) return;

    try {
      setProcessing(true);
      setProgress(0);
      setTranscript('');
      setResponse('');
      setError(null);

      await agentRef.current.startListening();

      // Feed audio in chunks to simulate streaming
      const chunkSize = 3200; // 100ms of 16kHz 16-bit mono audio
      const totalChunks = Math.ceil(audioBuffer.byteLength / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, audioBuffer.byteLength);
        const chunk = audioBuffer.slice(start, end);
        bufferInputRef.current.push(chunk);
        setProgress(((i + 1) / totalChunks) * 100);

        // Small delay to simulate real-time streaming
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      setProcessing(false);
    } catch (err) {
      setError((err as Error).message);
      setProcessing(false);
    }
  }, [audioBuffer]);

  return (
    <ExampleShell
      title="Buffer Input"
      description="BufferInput accepts programmatic audio instead of microphone capture. Upload a WAV file and feed it through the pipeline."
      number="51"
    >
      <div className="space-y-6">
        {error && <Alert variant="danger" title="Error">{error}</Alert>}

        {/* File Upload */}
        <Card>
          <CardBody>
            <CardTitle>Upload Audio File</CardTitle>
            <div className="mt-3 space-y-3">
              <input
                type="file"
                accept=".wav,.raw,.pcm"
                onChange={handleFileUpload}
                className="block w-full text-sm text-foreground-muted"
              />
              {fileName && (
                <div className="flex gap-2 items-center">
                  <Badge variant="neutral">{fileName}</Badge>
                  <span className="text-sm text-foreground-muted">
                    {(fileSize / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
              <Alert variant="info" title="Tip">
                Upload a 16kHz, 16-bit mono PCM WAV file for best results. The audio
                will be streamed through BufferInput in 100ms chunks.
              </Alert>
            </div>
          </CardBody>
        </Card>

        {/* BufferInput Config */}
        <Card>
          <CardBody>
            <CardTitle>
              BufferInput Configuration <Badge variant="neutral">AudioMetadata</Badge>
            </CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript" code={`const bufferInput = new BufferInput({
  sampleRate: 16000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
});

// Push audio data programmatically
bufferInput.push(audioChunkArrayBuffer);`} />
            </div>
          </CardBody>
        </Card>

        {/* Controls */}
        <div className="flex gap-2 items-center">
          <Badge variant={state === 'error' ? 'danger' : 'neutral'}>{state}</Badge>
          {!initialized ? (
            <Button onClick={handleInit} variant="primary">Initialize</Button>
          ) : (
            <Button
              onClick={handleProcess}
              variant="primary"
              disabled={!audioBuffer || processing}
            >
              {processing ? 'Processing...' : 'Process Audio'}
            </Button>
          )}
        </div>

        {/* Progress */}
        {processing && (
          <Card>
            <CardBody>
              <CardTitle>Streaming Progress</CardTitle>
              <div className="mt-2">
                <ProgressBar value={progress} max={100} />
                <p className="text-sm text-foreground-muted mt-1">
                  {progress.toFixed(0)}% of audio streamed
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardBody>
              <CardTitle>Transcript</CardTitle>
              <p className="text-sm mt-2">{transcript || 'Waiting for audio...'}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle>Response</CardTitle>
              <p className="text-sm mt-2">{response || 'Waiting for response...'}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </ExampleShell>
  );
}
