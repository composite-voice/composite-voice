/**
 * @packageDocumentation
 * Speech-to-speech agent providers — a single WebSocket covering STT + LLM + TTS.
 *
 * @remarks
 * - **DeepgramAgent** — Deepgram Voice Agent API (`agent.deepgram.com`).
 * - **OpenAIRealtimeAgent** — OpenAI Realtime API (`api.openai.com/v1/realtime`).
 * - **GeminiLiveAgent** — Gemini Live API (`BidiGenerateContent`).
 * - **ElevenLabsAgent** — ElevenLabs Conversational AI (`/v1/convai/conversation`).
 */

export { DeepgramAgent } from './deepgram/index';
export type {
  DeepgramAgentConfig,
  AgentFunctionDefinition,
  AgentAudioConfig,
  AgentListenConfig,
  AgentThinkConfig,
  AgentSpeakConfig,
  DeepgramAgentEvent,
  ThinkProvider,
  SpeakProvider,
} from './deepgram/index';

export { OpenAIRealtimeAgent } from './openai/index';
export type {
  OpenAIRealtimeAgentConfig,
  OpenAIRealtimeAgentEvent,
  RealtimeAgentTurnDetection,
  RealtimeAgentTool,
  RealtimeAgentFunctionCall,
} from './openai/index';

export { GeminiLiveAgent } from './gemini/index';
export type {
  GeminiLiveAgentConfig,
  GeminiLiveAgentEvent,
  GeminiLiveFunctionDeclaration,
  GeminiLiveFunctionCall,
} from './gemini/index';

export { ElevenLabsAgent } from './elevenlabs/index';
export type {
  ElevenLabsAgentConfig,
  ElevenLabsAgentEvent,
  ElevenLabsClientToolCall,
} from './elevenlabs/index';
