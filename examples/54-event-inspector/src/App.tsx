import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';
import { ExampleShell } from '../../_shared/ExampleShell';
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  Badge,
  Checkbox,
  Alert,
  CodeBlock,
} from '@lukeocodes/composite-voice-ui';

const ALL_EVENTS = [
  'transcription.start', 'transcription.interim', 'transcription.final',
  'transcription.speechFinal', 'transcription.preflight', 'transcription.error',
  'llm.start', 'llm.chunk', 'llm.complete', 'llm.error',
  'tts.start', 'tts.audio', 'tts.complete', 'tts.error',
  'agent.ready', 'agent.stateChange', 'agent.error',
  'audio.capture.start', 'audio.capture.stop', 'audio.capture.error',
  'audio.playback.start', 'audio.playback.end', 'audio.playback.error',
  'queue.overflow', 'queue.stats',
] as const;

const CATEGORIES = ['transcription', 'llm', 'tts', 'agent', 'audio', 'queue'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  transcription: 'info',
  llm: 'primary',
  tts: 'success',
  agent: 'warning',
  audio: 'neutral',
  queue: 'danger',
};

interface EventEntry {
  id: number;
  time: number;
  type: string;
  category: string;
  payload: string;
}

export default function App() {
  const agentRef = useRef<CompositeVoice | null>(null);
  const eventIdRef = useRef(0);
  const startTimeRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState('idle');
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(CATEGORIES));
  const [selectedEvent, setSelectedEvent] = useState<EventEntry | null>(null);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events]);

  const getCategory = (eventType: string): string => {
    const prefix = eventType.split('.')[0]!;
    return CATEGORIES.includes(prefix as any) ? prefix : 'unknown';
  };

  const summarizePayload = (eventType: string, data: any): string => {
    if (!data) return '';
    try {
      switch (eventType) {
        case 'transcription.interim':
        case 'transcription.final':
        case 'transcription.speechFinal':
          return data.text ? `"${data.text}"` : '';
        case 'agent.stateChange':
          return `${data.previousState ?? '?'} -> ${data.state}`;
        case 'llm.chunk':
          return `"${data.chunk ?? ''}"`;
        case 'llm.complete':
          return `${data.text?.length ?? 0} chars`;
        case 'tts.start':
          return data.text ? `"${data.text.slice(0, 60)}..."` : '';
        case 'queue.stats':
          return `${data.queueName}: ${data.size} buffered`;
        case 'queue.overflow':
          return `${data.queueName}: ${data.droppedChunks} dropped`;
        default:
          return JSON.stringify(data).slice(0, 120);
      }
    } catch {
      return '';
    }
  };

  const addEvent = useCallback((type: string, data: any) => {
    if (!startTimeRef.current) startTimeRef.current = performance.now();
    const elapsed = performance.now() - startTimeRef.current;
    const category = getCategory(type);

    const entry: EventEntry = {
      id: ++eventIdRef.current,
      time: elapsed,
      type,
      category,
      payload: JSON.stringify(data, null, 2) ?? '{}',
    };

    setEvents((prev) => [...prev.slice(-200), entry]);
    setEventCounts((prev) => ({
      ...prev,
      [category]: (prev[category] ?? 0) + 1,
    }));
  }, []);

  const toggleFilter = (category: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleInit = useCallback(async () => {
    const agent = new CompositeVoice({
      providers: [
        new MicrophoneInput({ sampleRate: 16000, format: 'pcm' }),
        new DeepgramSTT({ proxyUrl: `${window.location.origin}/proxy/deepgram` }),
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
        new BrowserAudioOutput(),
      ],
    });

    // Subscribe to ALL events
    ALL_EVENTS.forEach((eventType) => {
      agent.on(eventType as any, (data: any) => addEvent(eventType, data));
    });

    agent.on('agent.stateChange', (e) => setState(e.state));

    agentRef.current = agent;
    await agent.initialize();
    setInitialized(true);
  }, [addEvent]);

  const handleStart = useCallback(async () => {
    setEvents([]);
    setEventCounts({});
    startTimeRef.current = 0;
    await agentRef.current?.startListening();
    setRunning(true);
  }, []);

  const handleStop = useCallback(async () => {
    await agentRef.current?.stopListening();
    setRunning(false);
  }, []);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `+${Math.round(ms)}ms`;
    return `+${(ms / 1000).toFixed(3)}s`;
  };

  const filteredEvents = events.filter((e) => activeFilters.has(e.category));

  return (
    <ExampleShell
      title="Advanced Event Inspector"
      description="Real-time event timeline with payload inspection, category filtering, and event counts. Uses DeepgramSTT + AnthropicLLM + DeepgramTTS for full event coverage."
      number="54"
    >
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex gap-2 items-center flex-wrap">
          <Badge variant={CATEGORY_COLORS[state] as any ?? 'neutral'}>{state}</Badge>
          {!initialized ? (
            <Button onClick={handleInit} variant="primary">Initialize</Button>
          ) : !running ? (
            <Button onClick={handleStart} variant="primary">Start Listening</Button>
          ) : (
            <Button onClick={handleStop} variant="outline">Stop</Button>
          )}
          <Button
            onClick={() => { setEvents([]); setEventCounts({}); setSelectedEvent(null); }}
            variant="outline"
          >
            Clear
          </Button>
          <span className="text-sm text-foreground-muted ml-auto">
            {events.length} total events
          </span>
        </div>

        {/* Event Count Summary */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Badge key={cat} variant={CATEGORY_COLORS[cat] as any ?? 'neutral'}>
              {cat}: {eventCounts[cat] ?? 0}
            </Badge>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardBody>
            <CardTitle>Event Filters</CardTitle>
            <div className="flex gap-4 flex-wrap mt-3">
              {CATEGORIES.map((cat) => (
                <Checkbox
                  key={cat}
                  checked={activeFilters.has(cat)}
                  onChange={() => toggleFilter(cat)}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                />
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Timeline + Detail side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Timeline */}
          <Card>
            <CardBody>
              <CardTitle>Event Timeline</CardTitle>
              <div
                ref={timelineRef}
                className="mt-3 max-h-96 overflow-y-auto font-mono text-xs"
                style={{ background: 'var(--color-surface-raised)', borderRadius: '8px', padding: '8px' }}
              >
                {filteredEvents.length === 0 ? (
                  <p className="text-foreground-muted p-4 text-center">
                    Events will appear here once the agent is running...
                  </p>
                ) : (
                  filteredEvents.map((evt) => (
                    <div
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className="flex gap-2 py-0.5 cursor-pointer hover:bg-surface-raised"
                      style={{
                        opacity: selectedEvent?.id === evt.id ? 1 : 0.8,
                        fontWeight: selectedEvent?.id === evt.id ? 'bold' : 'normal',
                      }}
                    >
                      <span className="text-foreground-muted flex-shrink-0 w-20 text-right">
                        {formatTime(evt.time)}
                      </span>
                      <Badge variant={CATEGORY_COLORS[evt.category] as any ?? 'neutral'}>
                        {evt.type}
                      </Badge>
                      <span className="text-foreground-muted truncate">
                        {summarizePayload(evt.type, JSON.parse(evt.payload))}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          {/* Payload Detail */}
          <Card>
            <CardBody>
              <CardTitle>
                Event Payload
                {selectedEvent && (
                  <Badge variant="neutral" className="ml-2">{selectedEvent.type}</Badge>
                )}
              </CardTitle>
              <div className="mt-3">
                {selectedEvent ? (
                  <CodeBlock language="json">
                    {selectedEvent.payload}
                  </CodeBlock>
                ) : (
                  <p className="text-sm text-foreground-muted">
                    Click an event in the timeline to inspect its payload.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Usage Code */}
        <Card>
          <CardBody>
            <CardTitle>How to Subscribe to All Events</CardTitle>
            <div className="mt-3">
              <CodeBlock language="typescript">
{`// Subscribe to all events for debugging
const ALL_EVENTS = [
  'transcription.start', 'transcription.interim',
  'transcription.final', 'transcription.speechFinal',
  'llm.start', 'llm.chunk', 'llm.complete',
  'tts.start', 'tts.audio', 'tts.complete',
  'agent.ready', 'agent.stateChange', 'agent.error',
  'audio.capture.start', 'audio.capture.stop',
  'audio.playback.start', 'audio.playback.end',
  'queue.overflow', 'queue.stats',
];

ALL_EVENTS.forEach((eventType) => {
  agent.on(eventType, (data) => {
    console.log(eventType, data);
  });
});`}
              </CodeBlock>
            </div>
          </CardBody>
        </Card>
      </div>
    </ExampleShell>
  );
}
