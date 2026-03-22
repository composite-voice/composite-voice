/**
 * Deepgram Agent API provider for CompositeVoice.
 *
 * @remarks
 * `DeepgramAgent` connects to the Deepgram Voice Agent API
 * (`wss://agent.deepgram.com/v1/agent/converse`) via a single WebSocket that
 * collapses the STT + LLM + TTS pipeline into one connection. Deepgram handles
 * speech recognition, LLM inference, and text-to-speech synthesis server-side;
 * the client only sends raw audio and receives raw audio back.
 *
 * This provider extends {@link BaseAgentProvider} which handles the common
 * agent patterns (persistent connection, async iterable bridge, per-turn
 * audio tracking). DeepgramAgent adds the Deepgram-specific WebSocket
 * handshake, Settings message construction, and event handling.
 *
 * ```
 * [MicrophoneInput] → InputQueue → [DeepgramAgent (stt+llm+tts)] → OutputQueue → [BrowserAudioOutput]
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, DeepgramAgent } from '@lukeocodes/composite-voice';
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new DeepgramAgent({
 *       proxyUrl: '/api/proxy/deepgram-agent',
 *       think: {
 *         provider: { type: 'open_ai', model: 'gpt-4o' },
 *         prompt: 'You are a helpful voice assistant.',
 *       },
 *       speak: {
 *         provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
 *       },
 *     }),
 *   ],
 * });
 *
 * await voice.initialize();
 * await voice.startListening();
 * ```
 *
 * @packageDocumentation
 */

import { BaseAgentProvider } from '../../base/BaseAgentProvider';
import type { AudioEncoding } from '../../../core/types/audio';
import type { Logger } from '../../../utils/logger';
import type {
  DeepgramAgentConfig,
  AgentServerMessage,
  DeepgramAgentEvent,
  AgentSpeakConfig,
  AgentThinkConfig,
} from './types';

/** Default WebSocket base URL for the Deepgram Agent API. */
const DEFAULT_AGENT_BASE = 'wss://agent.deepgram.com';

/** Default audio config — must be consistent between Settings and metadata. */
const DEFAULT_AUDIO = {
  input: { encoding: 'linear16' as const, sample_rate: 16000 },
  output: { encoding: 'linear16' as const, sample_rate: 24000, container: 'none' as const },
};

/**
 * Deepgram Agent API provider — covers STT + LLM + TTS in a single WebSocket.
 *
 * @see {@link DeepgramAgentConfig} for configuration options
 * @see {@link BaseAgentProvider} for the shared agent provider base class
 * @see {@link DeepgramAgentEvent} for the event types emitted via {@link onDeepgramAgentEvent}
 */
export class DeepgramAgent extends BaseAgentProvider {
  // Narrow the config type for Deepgram-specific fields.
  // The base class sets this in its constructor; we just refine the type here.
  public declare readonly config: DeepgramAgentConfig & { model: string };

  private ws: WebSocket | null = null;
  private welcomeReceived = false;
  private settingsApplied = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  private agentEventCallback?: (event: DeepgramAgentEvent) => void;

  constructor(config: DeepgramAgentConfig, logger?: Logger) {
    super(
      {
        ...config,
        model: config.think?.provider?.model ?? 'agent-managed',
        ...(config.think?.prompt ? { systemPrompt: config.think.prompt } : {}),
      },
      logger
    );
    this.config = this.config as DeepgramAgentConfig & { model: string };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseProvider lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  protected async onInitialize(): Promise<void> {
    this.assertAuth();
  }

  protected async onDispose(): Promise<void> {
    this.cleanupPendingState();
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client disconnect');
    }
    this.ws = null;
    this.welcomeReceived = false;
    this.settingsApplied = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseAgentProvider abstract implementations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open the WebSocket and complete the Deepgram Agent handshake.
   *
   * @remarks
   * The connection follows a 3-step handshake:
   *
   * 1. **Open** — a WebSocket is opened to `wss://agent.deepgram.com/v1/agent/converse`
   *    (or the configured proxy URL). The client waits without sending anything.
   * 2. **Welcome → Settings** — the server sends a `Welcome` message containing a
   *    `request_id`. The client responds with a `Settings` message that configures
   *    `listen` (STT), `think` (LLM), and `speak` (TTS) providers.
   * 3. **SettingsApplied** — the server acknowledges the settings. At this point the
   *    connection is ready and the keep-alive timer (8 s interval) is started.
   *
   * The entire handshake must complete within the configured timeout (default 10 s,
   * override via {@link DeepgramAgentConfig.timeout | config.timeout}). If the
   * timeout elapses, the WebSocket is closed and the returned promise rejects.
   *
   * **Idempotent / piggyback behavior:** if the WebSocket is already fully
   * connected (`settingsApplied === true`), the call returns immediately. If a
   * connection is in progress, the caller piggybacks on the existing handshake
   * promise rather than opening a second socket.
   *
   * @throws {Error} If the handshake does not complete within the timeout window.
   * @throws {Error} If the WebSocket emits an error or closes before the handshake finishes.
   */
  async connect(): Promise<void> {
    // Already fully connected
    if (this.ws && this.settingsApplied) return;

    // Connection in progress — piggyback
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (!this.settingsApplied) {
        await new Promise<void>((resolve, reject) => {
          const prev = this.connectResolve;
          this.connectReject = (err) => { prev?.(); reject(err); };
          const prevR = this.connectReject;
          this.connectResolve = () => { prevR?.(new Error('superseded')); resolve(); };
        });
      }
      return;
    }

    const url = this.buildWebSocketUrl();

    await new Promise<void>((resolve, reject) => {
      const protocols = this.resolveWsProtocols();
      this.ws = new WebSocket(url, protocols);
      this.ws.binaryType = 'arraybuffer';

      this.connectResolve = resolve;
      this.connectReject = reject;

      const timeout = this.config.timeout ?? 10_000;
      const timer = setTimeout(() => {
        this.connectReject?.(new Error(`DeepgramAgent: handshake timed out after ${timeout}ms`));
        this.connectResolve = null;
        this.connectReject = null;
        this.ws?.close();
      }, timeout);

      this.ws.onopen = () => {
        // Wait for Welcome — do NOT send anything yet
      };

      this.ws.onerror = () => {
        clearTimeout(timer);
        this.connectReject?.(new Error('DeepgramAgent: WebSocket error during connection'));
        this.connectResolve = null;
        this.connectReject = null;
      };

      this.ws.onclose = (event) => {
        clearTimeout(timer);
        if (!this.settingsApplied) {
          this.connectReject?.(
            new Error(`DeepgramAgent: WebSocket closed before handshake complete (code: ${event.code})`)
          );
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.handleClose(event);
      };

      this.ws.onmessage = (event) => {
        if (!this.settingsApplied) clearTimeout(timer);
        this.handleMessage(event);
      };
    });
  }

  /**
   * Send a raw audio chunk to the Deepgram Agent for speech recognition.
   *
   * @param chunk - Raw PCM audio data matching the configured input encoding
   *   (default: linear16, 16 kHz). The buffer is sent as a binary WebSocket frame.
   *
   * @remarks
   * This is a no-op when the WebSocket is not in the `OPEN` state — audio sent
   * before {@link connect} completes or after the socket closes is silently dropped.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  protected emitOutputMetadata(): void {
    const agentConfig = this.config as DeepgramAgentConfig;
    const output = agentConfig.audio?.output ?? DEFAULT_AUDIO.output;
    const encoding = (output.encoding ?? 'linear16') as AudioEncoding;

    this.metadataCallback?.({
      sampleRate: output.sample_rate ?? 24000,
      encoding,
      channels: 1,
      bitDepth: encoding === 'linear16' ? 16 : 16,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deepgram-specific public API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Inject a text message as if the user spoke it.
   *
   * @param content - The text content to inject as a user utterance.
   *
   * @remarks
   * Sends an `InjectUserMessage` frame to the Agent API. The agent treats this
   * exactly like a transcribed user utterance — it will appear in the
   * conversation history and trigger an LLM response. Use this when you want to
   * drive the conversation programmatically without actual speech input (e.g.
   * pre-filling a question from a button click).
   *
   * @example
   * ```ts
   * agent.injectUserMessage('What is the weather in San Francisco?');
   * ```
   */
  injectUserMessage(content: string): void {
    this.sendJson({ type: 'InjectUserMessage', content });
  }

  /**
   * Force the agent to speak a specific message via TTS.
   *
   * @param message - The text the agent should speak aloud.
   *
   * @remarks
   * Sends an `InjectAgentMessage` frame. The server synthesizes the provided
   * text through the configured TTS provider and streams the resulting audio
   * back to the client. The message is also added to the conversation history
   * as an assistant turn. This is useful for announcements or guided prompts
   * that bypass the LLM entirely.
   *
   * The agent may refuse the injection if it is currently speaking; in that
   * case an `injection_refused` event is emitted via {@link onDeepgramAgentEvent}.
   *
   * @example
   * ```ts
   * agent.injectAgentMessage('Welcome! How can I help you today?');
   * ```
   */
  injectAgentMessage(message: string): void {
    this.sendJson({ type: 'InjectAgentMessage', message });
  }

  /**
   * Update the system prompt mid-session.
   *
   * @param prompt - The new system prompt text to use for subsequent LLM turns.
   *
   * @remarks
   * Sends an `UpdatePrompt` frame. The change takes effect on the **next** LLM
   * inference — it does not retroactively alter previous turns. A
   * `prompt_updated` event is emitted via {@link onDeepgramAgentEvent} when the
   * server acknowledges the change. Use this to adapt the agent's persona or
   * instructions in response to user actions without restarting the session.
   */
  updatePrompt(prompt: string): void {
    this.sendJson({ type: 'UpdatePrompt', prompt });
  }

  /**
   * Change the TTS provider or voice mid-session.
   *
   * @param speak - A single {@link AgentSpeakConfig} or an array of configs
   *   (for multi-provider setups). Replaces the current TTS configuration.
   *
   * @remarks
   * Sends an `UpdateSpeak` frame. The new voice is used starting with the
   * **next** agent utterance. A `speak_updated` event is emitted via
   * {@link onDeepgramAgentEvent} when the server acknowledges the change.
   *
   * @example
   * ```ts
   * // Switch to a different Deepgram Aura voice mid-conversation
   * agent.updateSpeak({
   *   provider: { type: 'deepgram', model: 'aura-2-orpheus-en' },
   * });
   * ```
   */
  updateSpeak(speak: AgentSpeakConfig | AgentSpeakConfig[]): void {
    this.sendJson({ type: 'UpdateSpeak', speak });
  }

  /**
   * Change the LLM provider or model mid-session.
   *
   * @param think - A single {@link AgentThinkConfig} or an array of configs
   *   (for multi-provider setups). Replaces the current LLM configuration.
   *
   * @remarks
   * Sends an `UpdateThink` frame. The new model is used starting with the
   * **next** inference turn. A `think_updated` event is emitted via
   * {@link onDeepgramAgentEvent} when the server acknowledges the change.
   *
   * @example
   * ```ts
   * // Upgrade to a more capable model mid-conversation
   * agent.updateThink({
   *   provider: { type: 'open_ai', model: 'gpt-4o' },
   *   prompt: 'You are an expert technical assistant.',
   * });
   * ```
   */
  updateThink(think: AgentThinkConfig | AgentThinkConfig[]): void {
    this.sendJson({ type: 'UpdateThink', think });
  }

  /**
   * Send a keep-alive signal to prevent the WebSocket from timing out.
   *
   * @remarks
   * Sends a `KeepAlive` JSON frame. You typically do **not** need to call this
   * manually — an automatic keep-alive timer is started after the handshake
   * completes, firing every 8 seconds. This method is exposed for advanced use
   * cases where you need to reset the idle timer or send an extra heartbeat.
   */
  sendKeepAlive(): void {
    this.sendJson({ type: 'KeepAlive' });
  }

  /**
   * Register a callback for Deepgram Agent-specific events.
   *
   * @param callback - Invoked synchronously each time the Agent API sends a
   *   typed event. Only one callback is active at a time; calling this again
   *   replaces the previous callback.
   *
   * @remarks
   * The callback receives a discriminated union ({@link DeepgramAgentEvent})
   * whose `type` field identifies the event. The full set of event types:
   *
   * - `user_started_speaking` — the user began speaking (barge-in detected).
   * - `agent_thinking` — the LLM is generating a response; `content` contains
   *   the partial or complete "thinking" text.
   * - `agent_started_speaking` — TTS audio playback has begun; includes
   *   `totalLatency`, `ttsLatency`, and `tttLatency` timing metrics.
   * - `agent_audio_done` — the agent has finished sending audio for this turn.
   * - `conversation_text` — a finalized transcript for either the `user` or
   *   `assistant` role, with the full `content` string.
   * - `function_call` — the agent is requesting execution of one or more
   *   functions; each entry includes `id`, `name`, `arguments`, and
   *   `clientSide` flag.
   * - `error` — a server-side error with `code` and `description`.
   * - `warning` — a server-side warning with `code` and `description`.
   * - `prompt_updated` — confirms a {@link updatePrompt} change was applied.
   * - `speak_updated` — confirms a {@link updateSpeak} change was applied.
   * - `think_updated` — confirms an {@link updateThink} change was applied.
   * - `injection_refused` — a {@link injectAgentMessage} or
   *   {@link injectUserMessage} was refused; `message` contains the reason.
   */
  onDeepgramAgentEvent(callback: (event: DeepgramAgentEvent) => void): void {
    this.agentEventCallback = callback;
  }

  /**
   * Check whether the underlying WebSocket is currently open.
   *
   * @returns `true` if the WebSocket exists and its `readyState` is `OPEN`;
   *   `false` otherwise (including during the handshake, after close, or if
   *   {@link connect} has not yet been called).
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: WebSocket message handling
  // ═══════════════════════════════════════════════════════════════════════

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.emitAudioChunk(event.data);
      return;
    }

    try {
      const msg = JSON.parse(event.data as string) as AgentServerMessage;
      this.handleJsonMessage(msg);
    } catch {
      this.logger.warn('DeepgramAgent: failed to parse WebSocket message');
    }
  }

  private handleJsonMessage(msg: AgentServerMessage): void {
    switch (msg.type) {
      case 'Welcome':
        this.logger.info(`DeepgramAgent: connected (request_id: ${msg.request_id})`);
        this.welcomeReceived = true;
        this.sendSettings();
        break;

      case 'SettingsApplied':
        this.settingsApplied = true;
        this.emitOutputMetadata();
        this.startKeepAlive(8_000, () => this.sendKeepAlive());
        this.connectResolve?.();
        this.connectResolve = null;
        this.connectReject = null;
        break;

      case 'ConversationText':
        this.emitEvent({ type: 'conversation_text', role: msg.role, content: msg.content });
        if (msg.role === 'user') {
          this.emitUserTranscription(msg.content);
        } else if (msg.role === 'assistant') {
          this.emitAssistantText(msg.content);
        }
        break;

      case 'UserStartedSpeaking':
        this.emitEvent({ type: 'user_started_speaking' });
        break;

      case 'AgentThinking':
        this.emitEvent({ type: 'agent_thinking', content: msg.content });
        break;

      case 'AgentStartedSpeaking':
        this.emitEvent({
          type: 'agent_started_speaking',
          totalLatency: msg.total_latency,
          ttsLatency: msg.tts_latency,
          tttLatency: msg.ttt_latency,
        });
        // Re-emit metadata (barge-in's output.stop() clears it)
        this.emitOutputMetadata();
        break;

      case 'AgentAudioDone':
        this.emitEvent({ type: 'agent_audio_done' });
        this.markAudioDone();
        break;

      case 'FunctionCallRequest':
        this.emitEvent({
          type: 'function_call',
          functions: msg.functions.map((f) => ({
            id: f.id,
            name: f.name,
            arguments: f.arguments,
            clientSide: f.client_side,
          })),
        });
        this.handleFunctionCallRequest(msg);
        break;

      case 'FunctionCallResponse':
        break;

      case 'Error':
        this.logger.error(`DeepgramAgent: error [${msg.code}]: ${msg.description}`);
        this.emitEvent({ type: 'error', code: msg.code, description: msg.description });
        this.rejectPendingLLM(new Error(`Agent error [${msg.code}]: ${msg.description}`));
        break;

      case 'Warning':
        this.logger.warn(`DeepgramAgent: warning [${msg.code}]: ${msg.description}`);
        this.emitEvent({ type: 'warning', code: msg.code, description: msg.description });
        break;

      case 'PromptUpdated':
        this.emitEvent({ type: 'prompt_updated' });
        break;

      case 'SpeakUpdated':
        this.emitEvent({ type: 'speak_updated' });
        break;

      case 'ThinkUpdated':
        this.emitEvent({ type: 'think_updated' });
        break;

      case 'InjectionRefused':
        this.logger.warn(`DeepgramAgent: injection refused — ${msg.message}`);
        this.emitEvent({ type: 'injection_refused', message: msg.message });
        break;
    }
  }

  private async handleFunctionCallRequest(
    msg: AgentServerMessage & { type: 'FunctionCallRequest' }
  ): Promise<void> {
    const handler = (this.config as DeepgramAgentConfig).onFunctionCall;

    for (const fn of msg.functions) {
      if (fn.client_side && handler) {
        try {
          const result = await handler({
            id: fn.id,
            name: fn.name,
            arguments: fn.arguments,
          });
          this.sendJson({
            type: 'FunctionCallResponse',
            id: fn.id,
            name: fn.name,
            content: result.content,
          });
        } catch (err) {
          this.sendJson({
            type: 'FunctionCallResponse',
            id: fn.id,
            name: fn.name,
            content: JSON.stringify({ error: String(err) }),
          });
        }
      }
    }
  }

  private handleClose(event: CloseEvent): void {
    this.logger.info(`DeepgramAgent: WebSocket closed (code: ${event.code}, reason: "${event.reason}")`);
    this.ws = null;
    this.welcomeReceived = false;
    this.settingsApplied = false;
    this.cleanupPendingState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: Settings message + helpers
  // ═══════════════════════════════════════════════════════════════════════

  private sendSettings(): void {
    if (!this.welcomeReceived) return;
    const agentConfig = this.config as DeepgramAgentConfig;

    const settings: Record<string, unknown> = {
      type: 'Settings',
      audio: agentConfig.audio ?? DEFAULT_AUDIO,
      agent: {
        listen: agentConfig.listen ?? {
          provider: { type: 'deepgram', model: 'nova-3' },
        },
        think: agentConfig.think ?? {
          provider: { type: 'open_ai', model: 'gpt-4o-mini' },
          prompt: 'You are a helpful voice assistant.',
        },
        speak: agentConfig.speak ?? {
          provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
        },
        ...(agentConfig.greeting !== undefined ? { greeting: agentConfig.greeting } : {}),
        ...(agentConfig.context ? { context: agentConfig.context } : {}),
      },
    };

    if (agentConfig.experimental !== undefined) {
      settings.experimental = agentConfig.experimental;
    }

    this.sendJson(settings);
  }

  private buildWebSocketUrl(): string {
    const base = this.resolveBaseUrl(DEFAULT_AGENT_BASE) ?? DEFAULT_AGENT_BASE;

    if (this.isProxyMode) {
      const wsBase = base
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://');
      return `${wsBase}/v1/agent/converse`;
    }

    return `${base}/v1/agent/converse`;
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emitEvent(event: DeepgramAgentEvent): void {
    this.agentEventCallback?.(event);
  }
}
