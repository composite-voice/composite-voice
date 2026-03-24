/**
 * Type definitions for the voice agent panel components.
 */

/** A single chat message displayed in the agent panel. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: SourceLink[];
  cta?: SourceLink;
}

/** A clickable link shown below a message. */
export interface SourceLink {
  title: string;
  url: string;
}

/** Voice agent pipeline state. */
export type AgentStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

/** Credential provider — called to get a fresh Deepgram JWT. */
export type TokenProvider = () => Promise<{ token: string; expiresIn: number }>;

/** Tool definition passed to the LLM. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

/** A tool call requested by the LLM. */
export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result returned from a tool execution. */
export interface AgentToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/** Configuration for the voice agent hook. */
export interface VoiceAgentConfig {
  /** Function that returns a fresh Deepgram JWT. */
  getToken: TokenProvider;
  /** Anthropic proxy URL (e.g. '/docs/api/proxy/anthropic'). */
  anthropicProxyUrl: string;
  /** Anthropic model ID. */
  model?: string;
  /** System prompt for the LLM. */
  systemPrompt?: string;
  /** Max tokens per LLM response. */
  maxTokens?: number;
  /** DeepgramFlux keyterms for improved recognition. */
  keyterms?: string[];
  /** TTS voice model. */
  voice?: string;
  /** Tools available to the LLM. */
  tools?: {
    definitions: AgentToolDefinition[];
    onToolCall: (toolCall: AgentToolCall) => Promise<AgentToolResult>;
  };
}

/** State returned by the useVoiceAgent hook. */
export interface VoiceAgentState {
  status: AgentStatus;
  messages: ChatMessage[];
  interimTranscript: string;
  streamingText: string;
  isListening: boolean;
  isMuted: boolean;
  isSpeakerMuted: boolean;
  error: string | null;
}

/** Actions returned by the useVoiceAgent hook. */
export interface VoiceAgentActions {
  initialize: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  toggleMic: () => void;
  toggleSpeaker: () => void;
  sendTextMessage: (text: string) => void;
  clearHistory: () => void;
}
