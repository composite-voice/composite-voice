/**
 * ElevenLabs Conversational AI agent provider for CompositeVoice.
 *
 * @remarks
 * `ElevenLabsAgent` connects to ElevenLabs Conversational AI
 * (`wss://api.elevenlabs.io/v1/convai/conversation`) via a single WebSocket
 * that collapses the STT + LLM + TTS pipeline. ElevenLabs handles voice
 * activity detection, transcription, LLM inference, and speech synthesis
 * server-side using the agent configured in your ElevenLabs dashboard; the
 * client sends raw PCM audio (base64-encoded in JSON frames) and receives
 * PCM audio back the same way.
 *
 * This provider extends {@link BaseAgentProvider} which handles the common
 * agent patterns (persistent connection, async iterable bridge, per-turn
 * audio tracking). ElevenLabsAgent adds the conversation initiation
 * handshake, `user_audio_chunk` transport, ping/pong keep-alive replies,
 * client tool calls, and audio-format negotiation from the conversation
 * metadata.
 *
 * ```
 * [MicrophoneInput] → InputQueue → [ElevenLabsAgent (stt+llm+tts)] → OutputQueue → [BrowserAudioOutput]
 * ```
 *
 * Audio format: input is 16 kHz mono PCM16 (the ConvAI default); output
 * format is announced by the server in the conversation metadata (e.g.
 * `pcm_16000`, `pcm_44100`, `ulaw_8000`) and forwarded to the output
 * provider automatically.
 *
 * **Turn model:** the ConvAI protocol has no explicit "audio done" message.
 * The provider treats a configurable gap in audio-chunk arrival
 * ({@link ElevenLabsAgentConfig.audioDoneSilenceMs}, default 1 s) as the
 * end of the agent's turn.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, ElevenLabsAgent } from 'composite-voice';
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new ElevenLabsAgent({
 *       agentId: 'agent_abc123',
 *       proxyUrl: '/api/proxy/elevenlabs',
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
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../utils/base64';
import type {
  ElevenLabsAgentConfig,
  ElevenLabsAgentEvent,
  ElevenLabsServerMessage,
  ElevenLabsClientToolCall,
} from './types';

/** Default WebSocket base URL for ElevenLabs. */
const ELEVENLABS_BASE = 'wss://api.elevenlabs.io';

/** Conversational AI WebSocket path. */
const CONVAI_PATH = '/v1/convai/conversation';

/**
 * ElevenLabs Conversational AI agent — covers STT + LLM + TTS in a single
 * WebSocket.
 *
 * @see {@link ElevenLabsAgentConfig} for configuration options
 * @see {@link BaseAgentProvider} for the shared agent provider base class
 * @see {@link ElevenLabsAgentEvent} for events emitted via {@link onAgentEvent}
 */
export class ElevenLabsAgent extends BaseAgentProvider {
  declare public readonly config: ElevenLabsAgentConfig & { model: string };

  private ws: WebSocket | null = null;
  private conversationStarted = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  /** Output audio format parsed from the conversation metadata. */
  private outputFormat: { encoding: AudioEncoding; sampleRate: number } = {
    encoding: 'linear16',
    sampleRate: 16000,
  };

  /** Idle timer that marks the agent's turn done when audio stops arriving. */
  private audioIdleTimer: ReturnType<typeof setTimeout> | null = null;

  private agentEventCallback?: (event: ElevenLabsAgentEvent) => void;

  constructor(config: ElevenLabsAgentConfig = {}, logger?: Logger) {
    super(
      {
        ...config,
        model: 'agent-managed',
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
      },
      logger
    );
    this.config = this.config as ElevenLabsAgentConfig & { model: string };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseProvider lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  protected async onInitialize(): Promise<void> {
    // A public agent needs only an agentId; a signed URL carries its own
    // auth. Only require credentials when neither is provided.
    if (!this.config.agentId && !this.config.signedUrl) {
      throw new Error('ElevenLabsAgent requires either "agentId" or "signedUrl".');
    }
  }

  protected async onDispose(): Promise<void> {
    this.clearAudioIdleTimer();
    this.cleanupPendingState();
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client disconnect');
    }
    this.ws = null;
    this.conversationStarted = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseAgentProvider abstract implementations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open the WebSocket and complete the conversation initiation handshake.
   *
   * @remarks
   * The connection follows a 2-step handshake:
   *
   * 1. **Open → initiation data** — a WebSocket is opened to the signed
   *    URL, the proxy, or `wss://api.elevenlabs.io/v1/convai/conversation`
   *    (with `agent_id`, plus `xi-api-key` in direct mode with an API key).
   *    On open, the client sends `conversation_initiation_client_data` with
   *    any configured overrides and dynamic variables.
   * 2. **conversation_initiation_metadata** — the server announces the
   *    conversation ID and audio formats. The output format is parsed and
   *    forwarded to the output provider; the connection is now ready.
   *
   * The handshake must complete within the configured timeout (default
   * 10 s, override via `config.timeout`).
   *
   * **Idempotent / piggyback behavior:** returns immediately when already
   * connected; piggybacks on an in-flight handshake instead of opening a
   * second socket.
   *
   * @throws {Error} If the handshake does not complete within the timeout.
   * @throws {Error} If the WebSocket errors or closes before the handshake finishes.
   */
  async connect(): Promise<void> {
    if (this.ws && this.conversationStarted) return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (!this.conversationStarted) {
        await new Promise<void>((resolve, reject) => {
          const prev = this.connectResolve;
          this.connectReject = (err) => {
            prev?.();
            reject(err);
          };
          const prevR = this.connectReject;
          this.connectResolve = () => {
            prevR?.(new Error('superseded'));
            resolve();
          };
        });
      }
      return;
    }

    const url = await this.buildWebSocketUrl();

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.connectResolve = resolve;
      this.connectReject = reject;

      const timeout = this.config.timeout ?? 10_000;
      const timer = setTimeout(() => {
        this.connectReject?.(new Error(`ElevenLabsAgent: handshake timed out after ${timeout}ms`));
        this.connectResolve = null;
        this.connectReject = null;
        this.ws?.close();
      }, timeout);

      this.ws.onopen = () => {
        this.sendJson(this.buildInitiationData());
      };

      this.ws.onerror = () => {
        clearTimeout(timer);
        this.connectReject?.(new Error('ElevenLabsAgent: WebSocket error during connection'));
        this.connectResolve = null;
        this.connectReject = null;
      };

      this.ws.onclose = (event) => {
        clearTimeout(timer);
        if (!this.conversationStarted) {
          this.connectReject?.(
            new Error(
              `ElevenLabsAgent: WebSocket closed before handshake complete (code: ${event.code})`
            )
          );
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.handleClose(event);
      };

      this.ws.onmessage = (event) => {
        if (!this.conversationStarted) clearTimeout(timer);
        this.handleMessage(event);
      };
    });
  }

  /**
   * Send a raw audio chunk to the agent for speech recognition.
   *
   * @param chunk - Raw PCM16 audio at 16 kHz mono (the ConvAI default input
   *   format). The buffer is base64-encoded into a `user_audio_chunk` frame.
   *
   * @remarks
   * No-op when the WebSocket is not open — audio sent before {@link connect}
   * completes or after the socket closes is silently dropped.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.sendJson({ user_audio_chunk: arrayBufferToBase64(chunk) });
  }

  protected emitOutputMetadata(): void {
    this.metadataCallback?.({
      sampleRate: this.outputFormat.sampleRate,
      encoding: this.outputFormat.encoding,
      channels: 1,
      bitDepth: 16,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ElevenLabs-specific public API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a callback for ElevenLabs agent events.
   *
   * @param callback - Invoked synchronously per event. Only one callback is
   *   active at a time; calling this again replaces the previous one.
   *
   * @see {@link ElevenLabsAgentEvent} for the event union
   */
  onAgentEvent(callback: (event: ElevenLabsAgentEvent) => void): void {
    this.agentEventCallback = callback;
  }

  /**
   * Inject a text message as if the user typed it.
   *
   * @param text - The user message content.
   *
   * @remarks
   * Sends a `user_message` frame. The agent responds exactly as it would to
   * transcribed speech.
   */
  sendUserMessage(text: string): void {
    this.sendJson({ type: 'user_message', text });
  }

  /**
   * Send background context to the agent without triggering a response.
   *
   * @param text - Contextual information (e.g. "the user navigated to the
   *   pricing page").
   *
   * @remarks
   * Sends a `contextual_update` frame. The agent factors the context into
   * subsequent responses but does not reply to it directly.
   */
  sendContextualUpdate(text: string): void {
    this.sendJson({ type: 'contextual_update', text });
  }

  /**
   * Signal user activity to reset the agent's inactivity timeout.
   *
   * @remarks
   * Sends a `user_activity` frame. Useful to keep the conversation alive
   * while the user is interacting silently (typing, reading).
   */
  sendUserActivity(): void {
    this.sendJson({ type: 'user_activity' });
  }

  /**
   * Check whether the underlying WebSocket is currently open.
   *
   * @returns `true` if the WebSocket exists and its `readyState` is `OPEN`.
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: WebSocket message handling
  // ═══════════════════════════════════════════════════════════════════════

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') {
      this.logger.warn('ElevenLabsAgent: unexpected binary frame, ignoring');
      return;
    }

    let msg: ElevenLabsServerMessage;
    try {
      msg = JSON.parse(event.data) as ElevenLabsServerMessage;
    } catch {
      this.logger.warn('ElevenLabsAgent: failed to parse WebSocket message');
      return;
    }

    switch (msg.type) {
      case 'conversation_initiation_metadata': {
        const meta = msg.conversation_initiation_metadata_event ?? {};
        this.parseOutputFormat(meta.agent_output_audio_format);
        this.conversationStarted = true;
        this.emitOutputMetadata();
        this.emitEvent({
          type: 'conversation_started',
          conversationId: meta.conversation_id ?? '',
        });
        this.connectResolve?.();
        this.connectResolve = null;
        this.connectReject = null;
        break;
      }

      case 'ping':
        // Server heartbeat — must be answered to keep the conversation open
        this.sendJson({ type: 'pong', event_id: msg.ping_event?.event_id });
        break;

      case 'user_transcript': {
        const transcript = (msg.user_transcription_event?.user_transcript ?? '').trim();
        if (transcript) {
          this.emitEvent({ type: 'conversation_text', role: 'user', content: transcript });
          this.emitUserTranscription(transcript);
        }
        break;
      }

      case 'agent_response': {
        const response = (msg.agent_response_event?.agent_response ?? '').trim();
        if (response) {
          this.emitEvent({ type: 'conversation_text', role: 'assistant', content: response });
          this.emitAssistantText(response);
        }
        break;
      }

      case 'agent_response_correction': {
        const correction = msg.agent_response_correction_event ?? {};
        this.emitEvent({
          type: 'agent_response_correction',
          original: correction.original_agent_response ?? '',
          corrected: correction.corrected_agent_response ?? '',
        });
        break;
      }

      case 'audio': {
        const audio = msg.audio_event?.audio_base_64;
        if (audio) {
          this.emitAudioChunk(base64ToArrayBuffer(audio));
          this.resetAudioIdleTimer();
        }
        break;
      }

      case 'interruption':
        this.emitEvent({
          type: 'interrupted',
          ...(msg.interruption_event?.reason !== undefined
            ? { reason: msg.interruption_event.reason }
            : {}),
        });
        this.clearAudioIdleTimer();
        this.markAudioDone();
        break;

      case 'vad_score':
        if (msg.vad_score_event?.vad_score !== undefined) {
          this.emitEvent({ type: 'vad_score', score: msg.vad_score_event.vad_score });
        }
        break;

      case 'internal_tentative_agent_response': {
        const tentative =
          msg.internal_tentative_agent_response_event?.tentative_agent_response ?? '';
        if (tentative) {
          this.emitEvent({ type: 'tentative_agent_response', content: tentative });
        }
        break;
      }

      case 'client_tool_call':
        void this.handleClientToolCall(msg);
        break;

      case 'error': {
        const message = msg.error ?? 'unknown error';
        this.logger.error(`ElevenLabsAgent: error: ${message}`);
        this.emitEvent({ type: 'error', message });
        this.rejectPendingLLM(new Error(`ElevenLabs agent error: ${message}`));
        break;
      }

      default:
        this.logger.debug('ElevenLabsAgent: unhandled message', { type: msg.type });
        break;
    }
  }

  private async handleClientToolCall(msg: ElevenLabsServerMessage): Promise<void> {
    const raw = msg.client_tool_call ?? {};
    const call: ElevenLabsClientToolCall = {
      toolCallId: raw.tool_call_id ?? '',
      toolName: raw.tool_name ?? '',
      parameters: raw.parameters ?? {},
    };

    this.emitEvent({ type: 'client_tool_call', call });

    const handler = this.config.onClientToolCall;
    if (!handler) return;

    try {
      const { result } = await handler(call);
      this.sendJson({
        type: 'client_tool_result',
        tool_call_id: call.toolCallId,
        result,
        is_error: false,
      });
    } catch (err) {
      this.sendJson({
        type: 'client_tool_result',
        tool_call_id: call.toolCallId,
        result: String(err),
        is_error: true,
      });
    }
  }

  private handleClose(event: CloseEvent): void {
    this.logger.info(
      `ElevenLabsAgent: WebSocket closed (code: ${event.code}, reason: "${event.reason}")`
    );
    this.ws = null;
    this.conversationStarted = false;
    this.clearAudioIdleTimer();
    this.cleanupPendingState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: audio-done detection
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * (Re)arm the idle timer that ends the agent's turn.
   *
   * @remarks
   * The ConvAI protocol has no "audio done" message, so a gap in audio
   * chunk arrival is the turn-completion signal.
   */
  private resetAudioIdleTimer(): void {
    this.clearAudioIdleTimer();
    const silenceMs = this.config.audioDoneSilenceMs ?? 1000;
    this.audioIdleTimer = setTimeout(() => {
      this.audioIdleTimer = null;
      this.emitEvent({ type: 'agent_audio_done' });
      this.markAudioDone();
    }, silenceMs);
  }

  private clearAudioIdleTimer(): void {
    if (this.audioIdleTimer) {
      clearTimeout(this.audioIdleTimer);
      this.audioIdleTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: initiation message + helpers
  // ═══════════════════════════════════════════════════════════════════════

  private buildInitiationData(): Record<string, unknown> {
    const agentOverrides: Record<string, unknown> = {};
    if (this.config.systemPrompt) {
      agentOverrides.prompt = { prompt: this.config.systemPrompt };
    }
    if (this.config.firstMessage !== undefined) {
      agentOverrides.first_message = this.config.firstMessage;
    }
    if (this.config.language) {
      agentOverrides.language = this.config.language;
    }

    const overrides: Record<string, unknown> = {};
    if (Object.keys(agentOverrides).length > 0) {
      overrides.agent = agentOverrides;
    }
    if (this.config.voiceId) {
      overrides.tts = { voice_id: this.config.voiceId };
    }

    return {
      type: 'conversation_initiation_client_data',
      ...(Object.keys(overrides).length > 0 ? { conversation_config_override: overrides } : {}),
      ...(this.config.dynamicVariables ? { dynamic_variables: this.config.dynamicVariables } : {}),
      ...this.config.initiationOverrides,
    };
  }

  /**
   * Parse the server-announced output format (e.g. `pcm_16000`,
   * `ulaw_8000`) into encoding + sample rate.
   */
  private parseOutputFormat(format?: string): void {
    if (!format) return;
    const match = /^(pcm|ulaw)_(\d+)$/.exec(format);
    if (!match) {
      this.logger.warn(`ElevenLabsAgent: unrecognized output format "${format}"`);
      return;
    }
    this.outputFormat = {
      encoding: match[1] === 'ulaw' ? 'mulaw' : 'linear16',
      sampleRate: Number(match[2]),
    };
  }

  /**
   * Build the WebSocket URL from the configured connection options.
   *
   * @remarks
   * Priority: signed URL → proxy → direct (with optional `xi-api-key`
   * query parameter, matching the ElevenLabs STT/TTS providers).
   */
  private async buildWebSocketUrl(): Promise<string> {
    if (this.config.signedUrl) {
      return typeof this.config.signedUrl === 'function'
        ? this.config.signedUrl()
        : this.config.signedUrl;
    }

    const params = new URLSearchParams();
    if (this.config.agentId) {
      params.set('agent_id', this.config.agentId);
    }

    if (this.isProxyMode) {
      const base = this.resolveBaseUrl(ELEVENLABS_BASE) ?? ELEVENLABS_BASE;
      return `${base}${CONVAI_PATH}?${params.toString()}`;
    }

    const apiKey = await this.resolveApiKey();
    if (apiKey) {
      params.set('xi-api-key', apiKey);
    }
    const base = this.resolveBaseUrl(ELEVENLABS_BASE) ?? ELEVENLABS_BASE;
    return `${base}${CONVAI_PATH}?${params.toString()}`;
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emitEvent(event: ElevenLabsAgentEvent): void {
    this.agentEventCallback?.(event);
  }
}
