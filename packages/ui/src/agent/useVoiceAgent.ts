/**
 * React hook that manages the CompositeVoice pipeline for the agent panel.
 *
 * Handles credential refresh, pipeline lifecycle, event wiring, and
 * message accumulation. Returns state + actions for the UI.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CompositeVoice as CompositeVoiceType } from 'composite-voice';
import type {
  VoiceAgentConfig,
  VoiceAgentState,
  VoiceAgentActions,
  ChatMessage,
  AgentStatus,
} from './types';

/** Generate a unique message ID. */
const msgId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Load conversation from localStorage. */
function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem('cv_agent_messages');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save conversation to localStorage. */
function saveMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem('cv_agent_messages', JSON.stringify(messages.slice(-50)));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function useVoiceAgent(config: VoiceAgentConfig): [VoiceAgentState, VoiceAgentActions] {
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voiceRef = useRef<CompositeVoiceType | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  // Hydrate messages from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) setMessages(saved);
  }, []);

  // Persist messages
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg: ChatMessage = { ...msg, id: msgId(), timestamp: Date.now() };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const initialize = useCallback(async () => {
    if (voiceRef.current) return;

    setStatus('connecting');
    setError(null);

    try {
      // Dynamic import to avoid SSR issues (CompositeVoice uses browser APIs)
      const {
        CompositeVoice,
        MicrophoneInput,
        DeepgramFlux,
        AnthropicLLM,
        DeepgramTTS,
        BrowserAudioOutput,
      } = await import(/* @vite-ignore */ 'composite-voice');

      const cfg = configRef.current;

      // Factory that fetches a fresh short-lived Deepgram JWT on each connection
      const getDeepgramKey = async () => {
        const { token } = await cfg.getToken();
        return token;
      };

      const voice = new CompositeVoice({
        providers: [
          new MicrophoneInput(),
          new DeepgramFlux({
            apiKey: getDeepgramKey,
            authType: 'bearer',
            options: {
              model: 'flux-general-en',
              eagerEotThreshold: 0.5,
              encoding: 'linear16',
              sampleRate: 16000,
            },
          }),
          new AnthropicLLM({
            proxyUrl: cfg.anthropicProxyUrl,
            model: cfg.model ?? 'claude-haiku-4-5',
            maxTokens: cfg.maxTokens ?? 1024,
            systemPrompt: cfg.systemPrompt ?? 'You are a helpful voice assistant for CompositeVoice SDK documentation. Answer questions concisely and conversationally.',
          }),
          new DeepgramTTS({
            apiKey: getDeepgramKey,
            authType: 'bearer',
            voice: cfg.voice ?? 'aura-2-thalia-en',
          }),
          new BrowserAudioOutput({ minBufferDuration: 300, enableSmoothing: true }),
        ],
        conversationHistory: { enabled: true, maxTurns: 20 },
        turnTaking: { pauseCaptureOnPlayback: false },
        logging: { enabled: false },
        ...(cfg.tools && {
          tools: {
            definitions: cfg.tools.definitions,
            onToolCall: cfg.tools.onToolCall,
          },
        }),
      });

      // Wire events
      voice.on('agent.stateChange', ({ state }) => {
        const map: Record<string, AgentStatus> = {
          idle: 'idle',
          ready: 'idle',
          listening: 'listening',
          thinking: 'thinking',
          speaking: 'speaking',
          error: 'error',
        };
        setStatus(map[state] ?? 'idle');
        setIsListening(state === 'listening');
      });

      voice.on('transcription.interim', ({ text }) => {
        setInterimTranscript(text);
      });

      voice.on('transcription.speechFinal', ({ text }) => {
        setInterimTranscript('');
        addMessage({ role: 'user', content: text });
      });

      voice.on('llm.start', () => {
        setStreamingText('');
        setStatus('thinking');
      });

      voice.on('llm.chunk', ({ accumulated }) => {
        setStreamingText(accumulated);
      });

      voice.on('llm.complete', ({ text }) => {
        setStreamingText('');
        addMessage({ role: 'assistant', content: text });
      });

      voice.on('agent.error', ({ error: err }) => {
        setError(String(err));
        setStatus('error');
      });

      await voice.initialize();
      voiceRef.current = voice;
      setStatus('idle');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, [addMessage]);

  const startListening = useCallback(async () => {
    if (!voiceRef.current) return;
    try {
      await voiceRef.current.startListening();
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!voiceRef.current) return;
    try {
      await voiceRef.current.stopListening();
      setIsListening(false);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const toggleMic = useCallback(async () => {
    if (isListening) {
      voiceRef.current?.stopListening();
      setIsListening(false);
      setIsMuted(true);
    } else {
      // Reinitialize the pipeline if it was torn down (e.g. inactivity)
      if (!voiceRef.current) {
        await initialize();
      }
      await voiceRef.current?.startListening();
      setIsMuted(false);
    }
  }, [isListening, initialize]);

  const toggleSpeaker = useCallback(() => {
    if (!voiceRef.current) return;
    const newMuted = !isSpeakerMuted;
    setIsSpeakerMuted(newMuted);
    if (newMuted) {
      voiceRef.current.muteOutput();
    } else {
      voiceRef.current.unmuteOutput();
    }
  }, [isSpeakerMuted]);

  const sendTextMessage = useCallback((text: string) => {
    if (!voiceRef.current || !text.trim()) return;
    addMessage({ role: 'user', content: text });
    voiceRef.current.sendMessage(text);
  }, [addMessage]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem('cv_agent_messages');
    voiceRef.current?.clearHistory();
  }, []);

  // Inactivity timeout — dispose pipeline after 2 minutes of no input,
  // or when the user switches to another browser tab.
  const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(async () => {
    if (!voiceRef.current) return;
    const voice = voiceRef.current;
    voiceRef.current = null;
    setStatus('idle');
    setIsListening(false);
    setIsMuted(false);
    setError(null);
    setInterimTranscript('');
    setStreamingText('');
    addMessage({ role: 'system', content: 'Closing connections while inactive.' });
    await voice.dispose();
  }, [addMessage]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (voiceRef.current) {
      inactivityTimer.current = setTimeout(teardown, INACTIVITY_TIMEOUT_MS);
    }
  }, [teardown]);

  // Reset timer on user activity (speech transcribed or text sent)
  useEffect(() => {
    resetInactivityTimer();
  }, [messages, resetInactivityTimer]);

  // Tear down when tab becomes hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && voiceRef.current) {
        teardown();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [teardown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      voiceRef.current?.dispose();
      voiceRef.current = null;
    };
  }, []);

  const state: VoiceAgentState = {
    status,
    messages,
    interimTranscript,
    streamingText,
    isListening,
    isMuted,
    isSpeakerMuted,
    error,
  };

  const actions: VoiceAgentActions = {
    initialize,
    startListening,
    stopListening,
    toggleMic,
    toggleSpeaker,
    sendTextMessage,
    clearHistory,
  };

  return [state, actions];
}
