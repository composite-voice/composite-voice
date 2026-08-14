/**
 * Guardrails example — pluggable async filters between LLM output and TTS.
 *
 * @remarks
 * Demonstrates the four built-in guardrail factories (blocklist, PII
 * redaction, pronunciation, moderation), the `streaming` vs `buffered`
 * trade-off, and the `guardrail.*` events, rendered as a live activity log.
 *
 * @packageDocumentation
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
  createPIIRedactionGuardrail,
  createPronunciationGuardrail,
  createBlocklistGuardrail,
  createModerationGuardrail,
  type Guardrail,
  type GuardrailMode,
} from 'composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import { VoiceAgent } from '../../_shared/VoiceAgent';
import { Card, CardBody, CardTitle, Badge, Label, Alert, CodeBlock } from 'composite-voice-ui';

/**
 * One entry in the guardrail activity log.
 *
 * @remarks
 * Each entry mirrors one `guardrail.*` event emitted while the agent speaks:
 *
 * ```text
 * LLM chunks ──▶ [ guardrail chain ] ──▶ TTS
 *                        │
 *                        ├─ guardrail.applied ─▶ { kind: 'applied' }
 *                        ├─ guardrail.blocked ─▶ { kind: 'blocked' }
 *                        └─ guardrail.error   ─▶ { kind: 'error' }
 * ```
 *
 * `detail` is display text derived from the event — never the pre-filter
 * `original`, which for PII redaction still contains the PII.
 *
 * @example
 * ```typescript
 * const entry: LogEntry = {
 *   kind: 'applied',
 *   guardrail: 'pii-redaction',
 *   stage: 'chunk',
 *   detail: 'redacted email → "reach us at an email address"',
 *   at: Date.now(),
 * };
 * ```
 *
 * @see {@link App} for the event handlers that append entries.
 */
interface LogEntry {
  kind: 'applied' | 'blocked' | 'error';
  guardrail: string;
  stage: string;
  detail: string;
  at: number;
}

/** Terms this agent must never say aloud. */
const BLOCKED_TERMS = ['Project Halcyon', 'Titan-2'];

/** Terms the TTS voice mispronounces. */
const PRONUNCIATION = {
  SQL: 'sequel',
  kubectl: 'kube control',
  PostgreSQL: 'post gres Q L',
  'CI/CD': 'C I C D',
};

/**
 * Stand-in for a real moderation API.
 *
 * @remarks
 * A production build would POST to a classifier and forward `ctx.signal` so an
 * interrupted turn cancels the request. Here it just looks for a phrase, with
 * a small delay so the async path is exercised.
 */
const demoModeration = createModerationGuardrail({
  replacement: "I'm not able to help with that.",
  async moderate(text) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const flagged = /\b(harm|dangerous instructions)\b/i.test(text);
    return flagged ? { flagged: true, categories: ['demo-policy'] } : { flagged: false };
  },
});

export default function App() {
  const [agent, setAgent] = useState<CompositeVoice | null>(null);
  const agentRef = useRef<CompositeVoice | null>(null);

  const [pii, setPii] = useState(true);
  const [pronunciation, setPronunciation] = useState(true);
  const [blocklist, setBlocklist] = useState(true);
  const [moderation, setModeration] = useState(false);
  const [mode, setMode] = useState<GuardrailMode>('streaming');
  const [log, setLog] = useState<LogEntry[]>([]);

  const buildFilters = useCallback((): Guardrail[] => {
    // Cheap and local first, network-bound last — a blocklist match costs
    // microseconds and saves a moderation round trip.
    const filters: Guardrail[] = [];
    if (blocklist) filters.push(createBlocklistGuardrail({ terms: BLOCKED_TERMS }));
    if (pii) {
      filters.push(
        createPIIRedactionGuardrail({
          types: ['email', 'phone', 'creditCard', 'ssn'],
          replacements: { email: 'an email address', phone: 'a phone number' },
        })
      );
    }
    if (pronunciation) {
      filters.push(createPronunciationGuardrail({ replacements: PRONUNCIATION }));
    }
    if (moderation) filters.push(demoModeration);
    return filters;
  }, [blocklist, pii, pronunciation, moderation]);

  const handleInit = useCallback(async () => {
    const newAgent = new CompositeVoice({
      providers: [
        new MicrophoneInput({ sampleRate: 16000, format: 'pcm' }),
        new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
        new AnthropicLLM({
          proxyUrl: `${window.location.origin}/proxy/anthropic`,
          model: 'claude-haiku-4-5-20251001',
          systemPrompt:
            'You are a helpful voice assistant. Respond in plain text only — no markdown. ' +
            'When asked for contact details, invent a plausible email address and phone number.',
          maxTokens: 400,
        }),
        new DeepgramTTS({
          proxyUrl: `${window.location.origin}/proxy/deepgram`,
          model: 'aura-asteria-en',
        }),
        new BrowserAudioOutput(),
      ],
      guardrails: {
        filters: buildFilters(),
        mode,
        timeoutMs: 2000,
        onError: 'passthrough',
      },
    });

    newAgent.on('llm.start', () => setLog([]));

    newAgent.on('guardrail.applied', (e) =>
      setLog((entries) => [
        ...entries,
        {
          kind: 'applied',
          guardrail: e.guardrail,
          stage: e.stage,
          // Deliberately not e.original — that is the text *before* the
          // guardrail ran, so for PII redaction it still contains the PII.
          detail: e.reason ? `${e.reason} → ${e.text}` : `rewrote to: ${e.text}`,
          at: e.timestamp,
        },
      ])
    );

    newAgent.on('guardrail.blocked', (e) =>
      setLog((entries) => [
        ...entries,
        {
          kind: 'blocked',
          guardrail: e.guardrail,
          stage: e.stage,
          detail: e.reason ?? 'suppressed',
          at: e.timestamp,
        },
      ])
    );

    newAgent.on('guardrail.error', (e) =>
      setLog((entries) => [
        ...entries,
        {
          kind: 'error',
          guardrail: e.guardrail,
          stage: e.stage,
          detail: `${e.error.message} (policy: ${e.policy})`,
          at: e.timestamp,
        },
      ])
    );

    await newAgent.initialize();
    agentRef.current = newAgent;
    setAgent(newAgent);
  }, [buildFilters, mode]);

  // Release the microphone and the provider sockets when the page navigates
  // away or the module is hot-reloaded.
  useEffect(() => {
    return () => {
      const active = agentRef.current;
      agentRef.current = null;
      void active?.dispose().catch(() => {
        // Nothing useful to do while unmounting.
      });
    };
  }, []);

  const handleStart = useCallback(async () => {
    setLog([]);
    await agentRef.current?.startListening();
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
  }, []);

  const toggle = (
    label: string,
    description: string,
    value: boolean,
    onChange: (next: boolean) => void
  ) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        disabled={agent !== null}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-foreground-muted">{description}</span>
      </span>
    </label>
  );

  return (
    <ExampleShell
      title="Guardrails"
      description="Pluggable async filters between LLM output and TTS. Redact PII, fix pronunciation, block forbidden terms, or run a moderation API — all without changing what the chat transcript shows."
      number="66"
    >
      <div className="space-y-6">
        <Card>
          <CardBody>
            <CardTitle>Filter chain</CardTitle>
            <p className="text-sm text-foreground-muted mt-1">
              Filters run in order, each receiving the previous one&apos;s output. Configure before
              initializing the agent.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              {toggle(
                'Blocklist',
                `Blocks the utterance on: ${BLOCKED_TERMS.join(', ')}`,
                blocklist,
                setBlocklist
              )}
              {toggle(
                'PII redaction',
                'Redacts emails, phone numbers, SSNs, and credit cards',
                pii,
                setPii
              )}
              {toggle(
                'Pronunciation',
                'Rewrites SQL, kubectl, PostgreSQL, CI/CD for the voice',
                pronunciation,
                setPronunciation
              )}
              {toggle(
                'Moderation (demo)',
                'Async classifier, final stage only — replaces flagged responses',
                moderation,
                setModeration
              )}
            </div>

            {moderation && mode === 'streaming' && (
              <Alert variant="warning" title="Moderation needs buffered mode" className="mt-4">
                This filter declares <code>stages: [&apos;final&apos;]</code>, and the final stage
                is only reached on a WebSocket TTS provider when the response is buffered. In{' '}
                <strong>streaming</strong> mode every segment — including the last — is filtered at
                the chunk stage, so this filter never runs.
              </Alert>
            )}

            <div className="mt-5">
              <Label htmlFor="mode">Mode</Label>
              <select
                id="mode"
                value={mode}
                disabled={agent !== null}
                onChange={(e) => setMode(e.target.value as GuardrailMode)}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
              >
                <option value="streaming">streaming — filter as it streams (low latency)</option>
                <option value="buffered">buffered — hold the response, block absolutely</option>
              </select>
              <Alert variant="info" title="The trade-off" className="mt-3">
                In <strong>streaming</strong> mode a block only suppresses text that has not yet
                reached the TTS provider, so the start of a forbidden sentence may already be
                audible. <strong>Buffered</strong> mode holds the whole response until it has been
                checked — blocking is absolute, but audio starts later.
              </Alert>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardTitle>Try saying</CardTitle>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Badge>PII</Badge> &ldquo;What&apos;s your support email and phone number?&rdquo;
              </li>
              <li>
                <Badge>Pronunciation</Badge> &ldquo;How do I run a SQL query with kubectl?&rdquo;
              </li>
              <li>
                <Badge>Blocklist</Badge> &ldquo;Tell me about Project Halcyon.&rdquo;
              </li>
              <li>
                <Badge>Moderation</Badge> &ldquo;Give me dangerous instructions.&rdquo;
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardTitle>Guardrail activity</CardTitle>
            {log.length === 0 ? (
              <p className="text-sm text-foreground-muted mt-3">
                Nothing filtered yet. Guardrail events appear here as the agent speaks.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm font-mono">
                {log.map((entry, i) => (
                  <li key={`${entry.at}-${i}`} className="flex gap-2 items-start">
                    <Badge
                      variant={
                        entry.kind === 'blocked'
                          ? 'danger'
                          : entry.kind === 'error'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {entry.kind}
                    </Badge>
                    <span className="text-foreground-muted">
                      {entry.guardrail}/{entry.stage}
                    </span>
                    <span className="flex-1 break-all">{entry.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <CardTitle>Configuration</CardTitle>
            <div className="mt-3">
              <CodeBlock
                language="typescript"
                code={`const agent = new CompositeVoice({
  providers: [...],
  guardrails: {
    mode: '${mode}',
    timeoutMs: 2000,
    onError: 'passthrough',   // 'block' to fail closed
    filters: [
${[
  blocklist && `      createBlocklistGuardrail({ terms: ${JSON.stringify(BLOCKED_TERMS)} }),`,
  pii && `      createPIIRedactionGuardrail({ types: ['email', 'phone', 'creditCard', 'ssn'] }),`,
  pronunciation && `      createPronunciationGuardrail({ replacements: { SQL: 'sequel', ... } }),`,
  moderation && `      createModerationGuardrail({ moderate }),`,
]
  .filter(Boolean)
  .join('\n')}
    ],
  },
});

// Guardrails change only what is spoken — llm.complete stays raw.
// e.original holds the pre-filter text (PII included) — keep it out of logs.
agent.on('guardrail.applied', (e) => console.log(e.guardrail, e.reason, '→', e.text));
agent.on('guardrail.blocked', (e) => console.warn(e.guardrail, e.reason));`}
              />
            </div>
          </CardBody>
        </Card>

        <VoiceAgent agent={agent} onInit={handleInit} onStart={handleStart} onStop={handleStop} />
      </div>
    </ExampleShell>
  );
}
