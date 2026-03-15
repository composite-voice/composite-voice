import React from 'react';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  CardDescription,
  Alert,
  Badge,
} from '@lukeocodes/composite-voice-ui';

export default function App() {
  return (
    <ExampleShell
      title="DeepgramFlux (V2 STT)"
      description="Deepgram's next-generation STT pipeline with structured turn events and eager LLM integration."
      number="14"
    >
      <div className="space-y-6">
        {/* Disabled Warning */}
        <Alert variant="warning" title="Provider Currently Disabled">
          DeepgramFlux requires the Deepgram SDK V5 (<code>listen.v2</code> API), which is
          not yet stable. This example shows what the configuration would look like and
          explains the eager pipeline concept. Use <strong>DeepgramSTT</strong> with Nova
          models as the current alternative.
        </Alert>

        {/* What Flux Would Look Like */}
        <Card>
          <CardBody>
            <CardTitle>Configuration Preview</CardTitle>
            <CardDescription>
              This is how you would configure DeepgramFlux once the V5 SDK stabilizes.
            </CardDescription>
            <pre className="mt-4 p-4 rounded bg-neutral-50 text-sm font-mono overflow-x-auto border border-neutral-200">
{`import {
  CompositeVoice,
  DeepgramFlux,
  MicrophoneInput,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramFlux({
      proxyUrl: \`\${window.location.origin}/proxy/deepgram\`,
      language: 'en-US',
      options: {
        model: 'nova-3',
        encoding: 'linear16',
        sampleRate: 16000,
        // V2-specific thresholds for eager pipeline
        eotThreshold: 0.5,       // End-of-turn confidence threshold
        eagerEotThreshold: 0.3,  // Eager end-of-turn threshold
        eotTimeoutMs: 2000,      // Timeout before forcing end-of-turn
        keyterms: ['CompositeVoice', 'Deepgram'],
      },
    }),
    new AnthropicLLM({
      proxyUrl: \`\${window.location.origin}/proxy/anthropic\`,
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a helpful voice assistant. Respond in plain text only — no markdown, no bullet points, no numbered lists, no code blocks. Keep responses concise and conversational.',
      maxTokens: 200,
    }),
    new NativeTTS({ rate: 1.0 }),
  ],
});`}
            </pre>
          </CardBody>
        </Card>

        {/* Flux Options Reference */}
        <Card>
          <CardBody>
            <CardTitle>DeepgramFlux Options</CardTitle>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-2 pr-4 font-semibold">Option</th>
                    <th className="text-left py-2 pr-4 font-semibold">Type</th>
                    <th className="text-left py-2 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="text-foreground-muted">
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">model</td>
                    <td className="py-2 pr-4">string</td>
                    <td className="py-2">Deepgram model (e.g. <code>nova-3</code>)</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">encoding</td>
                    <td className="py-2 pr-4">string</td>
                    <td className="py-2">Audio encoding format</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">sampleRate</td>
                    <td className="py-2 pr-4">number</td>
                    <td className="py-2">Audio sample rate in Hz</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">eotThreshold</td>
                    <td className="py-2 pr-4">number</td>
                    <td className="py-2">End-of-turn confidence threshold (0.0-1.0)</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">eagerEotThreshold</td>
                    <td className="py-2 pr-4">number</td>
                    <td className="py-2">Eager end-of-turn threshold for speculative generation</td>
                  </tr>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4 font-mono text-xs">eotTimeoutMs</td>
                    <td className="py-2 pr-4">number</td>
                    <td className="py-2">Timeout (ms) before forcing end-of-turn</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">keyterms</td>
                    <td className="py-2 pr-4">string[]</td>
                    <td className="py-2">Terms to boost recognition accuracy</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Eager Pipeline Concept */}
        <Card>
          <CardBody>
            <CardTitle>The Eager Pipeline Concept</CardTitle>
            <p className="text-sm text-foreground-muted mt-2 mb-4">
              DeepgramFlux V2 delivers structured turn events that enable speculative LLM
              generation, significantly reducing perceived latency.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge variant="info" size="lg">1</Badge>
                <div>
                  <p className="text-sm font-medium">StartOfTurn</p>
                  <p className="text-sm text-foreground-muted">
                    User begins speaking. The pipeline prepares for input.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="info" size="lg">2</Badge>
                <div>
                  <p className="text-sm font-medium">Update</p>
                  <p className="text-sm text-foreground-muted">
                    Streaming partial transcripts as the user speaks.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="warning" size="lg">3</Badge>
                <div>
                  <p className="text-sm font-medium">EagerEndOfTurn</p>
                  <p className="text-sm text-foreground-muted">
                    Confidence threshold crossed — the LLM begins generating speculatively.
                    If the user continues speaking, the speculative response is discarded.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="default" size="lg">3a</Badge>
                <div>
                  <p className="text-sm font-medium">TurnResumed</p>
                  <p className="text-sm text-foreground-muted">
                    User resumed speaking after an eager end-of-turn. Speculative LLM
                    output is discarded, and transcription continues.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="success" size="lg">4</Badge>
                <div>
                  <p className="text-sm font-medium">EndOfTurn</p>
                  <p className="text-sm text-foreground-muted">
                    Confirmed end of speech. If speculative output matches, it is used
                    immediately — the user perceives near-zero latency.
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Current Alternative */}
        <Card variant="filled">
          <CardBody>
            <CardTitle level={4}>Current Alternative</CardTitle>
            <p className="text-sm text-foreground-muted mt-2">
              While DeepgramFlux is disabled, you can achieve similar results using{' '}
              <strong>DeepgramSTT</strong> with Nova models. The V1 API supports{' '}
              <code>interimResults</code>, <code>endpointing</code>, and{' '}
              <code>vadEvents</code> which provide a good approximation of turn detection.
              See <a href="../11-deepgram-stt/" className="text-primary-600 underline">Example 11</a> for details.
            </p>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
