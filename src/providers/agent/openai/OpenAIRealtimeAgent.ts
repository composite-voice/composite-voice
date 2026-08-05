/**
 * OpenAI Realtime API speech-to-speech agent provider for CompositeVoice.
 *
 * @remarks
 * `OpenAIRealtimeAgent` connects to the OpenAI Realtime API
 * (`wss://api.openai.com/v1/realtime`) via a single WebSocket that collapses
 * the STT + LLM + TTS pipeline into one connection. OpenAI handles voice
 * activity detection, speech understanding, response generation, and speech
 * synthesis server-side; the client sends raw PCM audio (base64-encoded in
 * JSON frames) and receives PCM audio back the same way.
 *
 * This provider extends {@link BaseAgentProvider} which handles the common
 * agent patterns (persistent connection, async iterable bridge, per-turn
 * audio tracking). OpenAIRealtimeAgent adds the Realtime handshake
 * (`session.created` → `session.update` → `session.updated`), base64 audio
 * transport, input transcription wiring, and function calling.
 *
 * ```
 * [MicrophoneInput] → InputQueue → [OpenAIRealtimeAgent (stt+llm+tts)] → OutputQueue → [BrowserAudioOutput]
 * ```
 *
 * Audio format: input and output are both 24 kHz mono PCM16 — the only rate
 * the Realtime API supports for raw PCM.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, OpenAIRealtimeAgent } from 'composite-voice';
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new OpenAIRealtimeAgent({
 *       proxyUrl: '/api/proxy/openai-realtime',
 *       model: 'gpt-realtime',
 *       voice: 'marin',
 *       instructions: 'You are a helpful voice assistant. Keep answers brief.',
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
import type { Logger } from '../../../utils/logger';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../utils/base64';
import type {
  OpenAIRealtimeAgentConfig,
  OpenAIRealtimeAgentEvent,
  RealtimeServerEvent,
  RealtimeAgentTurnDetection,
} from './types';

/** Default WebSocket base URL for the OpenAI Realtime API. */
const OPENAI_REALTIME_BASE = 'wss://api.openai.com';

/** The Realtime API only supports 24 kHz for raw PCM in and out. */
const PCM_SAMPLE_RATE = 24000;

/**
 * OpenAI Realtime speech-to-speech agent — covers STT + LLM + TTS in a
 * single WebSocket.
 *
 * @see {@link OpenAIRealtimeAgentConfig} for configuration options
 * @see {@link BaseAgentProvider} for the shared agent provider base class
 * @see {@link OpenAIRealtimeAgentEvent} for events emitted via {@link onAgentEvent}
 */
export class OpenAIRealtimeAgent extends BaseAgentProvider {
  declare public readonly config: OpenAIRealtimeAgentConfig & { model: string };

  private ws: WebSocket | null = null;
  private sessionReady = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  /** Accumulated output-audio transcript for the in-flight response. */
  private responseTranscript = '';

  private agentEventCallback?: (event: OpenAIRealtimeAgentEvent) => void;

  constructor(config: OpenAIRealtimeAgentConfig = {}, logger?: Logger) {
    super(
      {
        ...config,
        model: config.model ?? 'gpt-realtime',
        ...(config.instructions ? { systemPrompt: config.instructions } : {}),
      },
      logger
    );
    this.config = this.config as OpenAIRealtimeAgentConfig & { model: string };
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
    this.sessionReady = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseAgentProvider abstract implementations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open the WebSocket and complete the Realtime session handshake.
   *
   * @remarks
   * The connection follows a 3-step handshake:
   *
   * 1. **Open** — a WebSocket is opened to
   *    `wss://api.openai.com/v1/realtime?model=<model>` (or the configured
   *    proxy URL). Direct mode authenticates via subprotocols
   *    (`'realtime'`, `'openai-insecure-api-key.<KEY>'`).
   * 2. **session.created → session.update** — after the server announces
   *    the session, the client sends a `session.update` configuring audio
   *    formats, voice, instructions, input transcription, turn detection,
   *    and tools.
   * 3. **session.updated** — the server acknowledges the configuration.
   *    The connection is now ready for audio.
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
    if (this.ws && this.sessionReady) return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (!this.sessionReady) {
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

    const url = this.buildWebSocketUrl();
    const protocols = await this.buildProtocols();

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url, protocols);
      this.ws.binaryType = 'arraybuffer';

      this.connectResolve = resolve;
      this.connectReject = reject;

      const timeout = this.config.timeout ?? 10_000;
      const timer = setTimeout(() => {
        this.connectReject?.(
          new Error(`OpenAIRealtimeAgent: handshake timed out after ${timeout}ms`)
        );
        this.connectResolve = null;
        this.connectReject = null;
        this.ws?.close();
      }, timeout);

      this.ws.onopen = () => {
        // Wait for session.created before configuring
      };

      this.ws.onerror = () => {
        clearTimeout(timer);
        this.connectReject?.(new Error('OpenAIRealtimeAgent: WebSocket error during connection'));
        this.connectResolve = null;
        this.connectReject = null;
      };

      this.ws.onclose = (event) => {
        clearTimeout(timer);
        if (!this.sessionReady) {
          this.connectReject?.(
            new Error(
              `OpenAIRealtimeAgent: WebSocket closed before handshake complete (code: ${event.code})`
            )
          );
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.handleClose(event);
      };

      this.ws.onmessage = (event) => {
        if (!this.sessionReady) clearTimeout(timer);
        this.handleMessage(event);
      };
    });
  }

  /**
   * Send a raw audio chunk to the agent for speech recognition.
   *
   * @param chunk - Raw PCM16 audio at 24 kHz mono. The buffer is
   *   base64-encoded into an `input_audio_buffer.append` JSON frame.
   *
   * @remarks
   * No-op when the WebSocket is not open — audio sent before {@link connect}
   * completes or after the socket closes is silently dropped.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.sendJson({
      type: 'input_audio_buffer.append',
      audio: arrayBufferToBase64(chunk),
    });
  }

  protected emitOutputMetadata(): void {
    this.metadataCallback?.({
      sampleRate: PCM_SAMPLE_RATE,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OpenAI-specific public API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a callback for OpenAI Realtime agent events.
   *
   * @param callback - Invoked synchronously per event. Only one callback is
   *   active at a time; calling this again replaces the previous one.
   *
   * @see {@link OpenAIRealtimeAgentEvent} for the event union
   */
  onAgentEvent(callback: (event: OpenAIRealtimeAgentEvent) => void): void {
    this.agentEventCallback = callback;
  }

  /**
   * Inject a text message as if the user typed it, and request a response.
   *
   * @param text - The user message content.
   *
   * @remarks
   * Creates a `conversation.item.create` with a user message followed by
   * `response.create`, so the agent answers in speech without any audio
   * input. Useful for driving the conversation programmatically.
   */
  sendUserMessage(text: string): void {
    this.sendJson({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.sendJson({ type: 'response.create' });
  }

  /**
   * Update session settings mid-conversation.
   *
   * @param session - Partial session fields merged by the server (e.g.
   *   `{ instructions: '...' }`).
   *
   * @remarks
   * Sends a `session.update` event. Changes apply from the next response.
   */
  updateSession(session: Record<string, unknown>): void {
    this.sendJson({ type: 'session.update', session });
  }

  /**
   * Cancel the in-flight response, stopping generation and audio.
   *
   * @remarks
   * Sends `response.cancel`. The SDK's own barge-in already stops local
   * playback; this additionally stops server-side generation.
   */
  cancelResponse(): void {
    this.sendJson({ type: 'response.cancel' });
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
      this.logger.warn('OpenAIRealtimeAgent: unexpected binary frame, ignoring');
      return;
    }

    let msg: RealtimeServerEvent;
    try {
      msg = JSON.parse(event.data) as RealtimeServerEvent;
    } catch {
      this.logger.warn('OpenAIRealtimeAgent: failed to parse WebSocket message');
      return;
    }

    switch (msg.type) {
      case 'session.created':
        this.sendJson(this.buildSessionUpdate());
        break;

      case 'session.updated':
        if (!this.sessionReady) {
          this.sessionReady = true;
          this.emitOutputMetadata();
          this.connectResolve?.();
          this.connectResolve = null;
          this.connectReject = null;
        }
        break;

      case 'input_audio_buffer.speech_started':
        this.emitEvent({ type: 'user_started_speaking' });
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emitEvent({ type: 'user_stopped_speaking' });
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (msg.transcript ?? '').trim();
        if (transcript) {
          this.emitEvent({ type: 'conversation_text', role: 'user', content: transcript });
          this.emitUserTranscription(transcript);
        }
        break;
      }

      // GA and preview names for streamed output audio
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (msg.delta) {
          this.emitAudioChunk(base64ToArrayBuffer(msg.delta));
        }
        break;

      // GA and preview names for the streamed output transcript
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (msg.delta) {
          this.responseTranscript += msg.delta;
          this.emitEvent({ type: 'agent_transcript_delta', delta: msg.delta });
        }
        break;

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        // Prefer the authoritative transcript over accumulated deltas
        if (msg.transcript) {
          this.responseTranscript = msg.transcript;
        }
        break;

      case 'response.output_item.done':
        if (msg.item?.type === 'function_call') {
          this.handleFunctionCall(msg.item);
        }
        break;

      case 'response.done': {
        const text = this.responseTranscript.trim();
        this.responseTranscript = '';
        if (text) {
          this.emitEvent({ type: 'conversation_text', role: 'assistant', content: text });
          this.emitAssistantText(text);
        }
        this.emitEvent({ type: 'agent_audio_done' });
        this.markAudioDone();
        break;
      }

      case 'error': {
        const message = msg.error?.message ?? 'unknown error';
        this.logger.error(`OpenAIRealtimeAgent: error [${msg.error?.code ?? '-'}]: ${message}`);
        this.emitEvent({
          type: 'error',
          ...(msg.error?.code !== undefined ? { code: msg.error.code } : {}),
          message,
        });
        this.rejectPendingLLM(new Error(`Realtime error: ${message}`));
        break;
      }

      default:
        this.logger.debug('OpenAIRealtimeAgent: unhandled event', { type: msg.type });
        break;
    }
  }

  private async handleFunctionCall(item: {
    call_id?: string;
    name?: string;
    arguments?: string;
  }): Promise<void> {
    const callId = item.call_id ?? '';
    const name = item.name ?? '';
    const args = item.arguments ?? '{}';

    this.emitEvent({ type: 'function_call', callId, name, arguments: args });

    const handler = this.config.onFunctionCall;
    if (!handler) return;

    let output: string;
    try {
      const result = await handler({ callId, name, arguments: args });
      output = result.content;
    } catch (err) {
      output = JSON.stringify({ error: String(err) });
    }

    this.sendJson({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
    // Ask the model to continue (speak the tool result)
    this.sendJson({ type: 'response.create' });
  }

  private handleClose(event: CloseEvent): void {
    this.logger.info(
      `OpenAIRealtimeAgent: WebSocket closed (code: ${event.code}, reason: "${event.reason}")`
    );
    this.ws = null;
    this.sessionReady = false;
    this.responseTranscript = '';
    this.cleanupPendingState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: session configuration + helpers
  // ═══════════════════════════════════════════════════════════════════════

  private buildSessionUpdate(): Record<string, unknown> {
    const transcription: Record<string, unknown> = {
      model: this.config.transcriptionModel ?? 'gpt-4o-mini-transcribe',
    };
    if (this.config.language) {
      transcription.language = this.config.language;
    }

    const session: Record<string, unknown> = {
      type: 'realtime',
      output_modalities: ['audio'],
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE },
          transcription,
          turn_detection: this.buildTurnDetection(),
        },
        output: {
          format: { type: 'audio/pcm', rate: PCM_SAMPLE_RATE },
          voice: this.config.voice ?? 'alloy',
        },
      },
    };

    if (this.config.instructions) {
      session.instructions = this.config.instructions;
    }
    if (this.config.temperature !== undefined) {
      session.temperature = this.config.temperature;
    }
    if (this.config.tools?.length) {
      session.tools = this.config.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.parameters ? { parameters: tool.parameters } : {}),
      }));
    }

    return {
      type: 'session.update',
      session: { ...session, ...this.config.sessionOverrides },
    };
  }

  private buildTurnDetection(): Record<string, unknown> | null {
    const turnDetection: RealtimeAgentTurnDetection | null =
      this.config.turnDetection === undefined ? { type: 'server_vad' } : this.config.turnDetection;

    if (turnDetection === null) return null;

    if (turnDetection.type === 'semantic_vad') {
      return {
        type: 'semantic_vad',
        ...(turnDetection.eagerness ? { eagerness: turnDetection.eagerness } : {}),
      };
    }

    const wire: Record<string, unknown> = { type: 'server_vad' };
    if (turnDetection.threshold != null) wire.threshold = turnDetection.threshold;
    if (turnDetection.prefixPaddingMs != null)
      wire.prefix_padding_ms = turnDetection.prefixPaddingMs;
    if (turnDetection.silenceDurationMs != null) {
      wire.silence_duration_ms = turnDetection.silenceDurationMs;
    }
    return wire;
  }

  private buildWebSocketUrl(): string {
    const base = this.resolveBaseUrl(OPENAI_REALTIME_BASE) ?? OPENAI_REALTIME_BASE;
    return `${base}/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
  }

  /**
   * Resolve the WebSocket subprotocols used for direct-mode auth.
   *
   * @remarks
   * OpenAI documents browser WebSocket authentication via subprotocols:
   * `'realtime'` plus `'openai-insecure-api-key.<KEY>'` (and optionally
   * organization / project). Returns `undefined` in proxy mode, where the
   * proxy injects an `Authorization: Bearer` header instead.
   */
  private async buildProtocols(): Promise<string[] | undefined> {
    if (this.isProxyMode) return undefined;

    const apiKey = await this.resolveApiKey();
    const protocols = ['realtime', `openai-insecure-api-key.${apiKey}`];

    if (this.config.organizationId) {
      protocols.push(`openai-organization.${this.config.organizationId}`);
    }
    if (this.config.projectId) {
      protocols.push(`openai-project.${this.config.projectId}`);
    }

    return protocols;
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emitEvent(event: OpenAIRealtimeAgentEvent): void {
    this.agentEventCallback?.(event);
  }
}
