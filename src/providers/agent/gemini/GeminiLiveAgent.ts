/**
 * Gemini Live API speech-to-speech agent provider for CompositeVoice.
 *
 * @remarks
 * `GeminiLiveAgent` connects to the Gemini Live API
 * (`BidiGenerateContent` over WebSocket on
 * `generativelanguage.googleapis.com`) via a single connection that
 * collapses the STT + LLM + TTS pipeline. Google handles voice activity
 * detection, speech understanding, response generation, and speech
 * synthesis server-side; the client sends raw PCM audio (base64-encoded in
 * JSON frames) and receives PCM audio back the same way.
 *
 * This provider extends {@link BaseAgentProvider} which handles the common
 * agent patterns (persistent connection, async iterable bridge, per-turn
 * audio tracking). GeminiLiveAgent adds the Live API setup handshake,
 * `realtimeInput` audio transport, transcription accumulation, turn
 * tracking, and tool calling.
 *
 * ```
 * [MicrophoneInput] → InputQueue → [GeminiLiveAgent (stt+llm+tts)] → OutputQueue → [BrowserAudioOutput]
 * ```
 *
 * Audio format: input is 16 kHz mono PCM16, output is 24 kHz mono PCM16 —
 * the Live API's native rates.
 *
 * **Turn model:** the Live API streams the user's transcript in fragments
 * (`inputTranscription`) with no explicit end-of-utterance marker; the turn
 * boundary is the arrival of the first model output. This provider
 * accumulates the fragments and emits the user transcription when the model
 * starts responding, then emits the assistant text when the server signals
 * `turnComplete`.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, GeminiLiveAgent } from 'composite-voice';
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new GeminiLiveAgent({
 *       proxyUrl: '/api/proxy/gemini-live',
 *       model: 'gemini-2.0-flash-live-001',
 *       voice: 'Puck',
 *       systemInstruction: 'You are a helpful voice assistant. Keep answers brief.',
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
import type { AudioMetadata } from '../../../core/types/audio';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../../../utils/base64';
import type {
  GeminiLiveAgentConfig,
  GeminiLiveAgentEvent,
  GeminiServerMessage,
  GeminiLiveFunctionCall,
} from './types';

/** Default WebSocket base URL for the Gemini Live API. */
const GEMINI_LIVE_BASE = 'wss://generativelanguage.googleapis.com';

/** BidiGenerateContent WebSocket path. */
const GEMINI_LIVE_PATH =
  '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** The Live API expects 16 kHz PCM16 in and produces 24 kHz PCM16 out. */
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

/**
 * Gemini Live speech-to-speech agent — covers STT + LLM + TTS in a single
 * WebSocket.
 *
 * @see {@link GeminiLiveAgentConfig} for configuration options
 * @see {@link BaseAgentProvider} for the shared agent provider base class
 * @see {@link GeminiLiveAgentEvent} for events emitted via {@link onAgentEvent}
 */
export class GeminiLiveAgent extends BaseAgentProvider {
  declare public readonly config: GeminiLiveAgentConfig & { model: string };

  private ws: WebSocket | null = null;
  private setupComplete = false;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  /** Accumulated user transcript fragments for the turn in progress. */
  private inputTranscript = '';

  /** Accumulated assistant transcript fragments for the response in progress. */
  private outputTranscript = '';

  /** Whether the pending user transcript has been emitted for this turn. */
  private userTurnEmitted = false;

  /** The Live API's native input rate — what an auto-created mic should use. */
  public override readonly preferredInputSampleRate = INPUT_SAMPLE_RATE;

  /** Actual capture rate of the input provider, learned from the pipeline. */
  private inputSampleRate = INPUT_SAMPLE_RATE;

  private agentEventCallback?: (event: GeminiLiveAgentEvent) => void;

  constructor(config: GeminiLiveAgentConfig = {}, logger?: Logger) {
    super(
      {
        ...config,
        model: config.model ?? 'gemini-2.0-flash-live-001',
        ...(config.systemInstruction ? { systemPrompt: config.systemInstruction } : {}),
      },
      logger
    );
    this.config = this.config as GeminiLiveAgentConfig & { model: string };
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
    this.setupComplete = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BaseAgentProvider abstract implementations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open the WebSocket and complete the Live API setup handshake.
   *
   * @remarks
   * The connection follows a 2-step handshake:
   *
   * 1. **Open → setup** — a WebSocket is opened to the
   *    `BidiGenerateContent` endpoint (direct mode appends `?key=<API_KEY>`;
   *    proxy mode lets the proxy inject the key). On open, the client sends
   *    a `setup` message with the model, generation config (audio response
   *    modality, voice), system instruction, transcription flags, and tools.
   * 2. **setupComplete** — the server acknowledges. The connection is now
   *    ready for `realtimeInput` audio.
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
    if (this.ws && this.setupComplete) return;

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      if (!this.setupComplete) {
        // Chain onto the in-flight handshake: whichever way it settles, both
        // this caller and the original one see the same outcome.
        await new Promise<void>((resolve, reject) => {
          const prevResolve = this.connectResolve;
          const prevReject = this.connectReject;
          this.connectResolve = () => {
            prevResolve?.();
            resolve();
          };
          this.connectReject = (err) => {
            prevReject?.(err);
            reject(err);
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
        this.connectReject?.(new Error(`GeminiLiveAgent: handshake timed out after ${timeout}ms`));
        this.connectResolve = null;
        this.connectReject = null;
        this.ws?.close();
      }, timeout);

      this.ws.onopen = () => {
        this.sendJson(this.buildSetup());
      };

      this.ws.onerror = () => {
        clearTimeout(timer);
        this.connectReject?.(new Error('GeminiLiveAgent: WebSocket error during connection'));
        this.connectResolve = null;
        this.connectReject = null;
      };

      this.ws.onclose = (event) => {
        clearTimeout(timer);
        if (!this.setupComplete) {
          this.connectReject?.(
            new Error(
              `GeminiLiveAgent: WebSocket closed before handshake complete (code: ${event.code})`
            )
          );
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.handleClose(event);
      };

      this.ws.onmessage = (event) => {
        if (!this.setupComplete) clearTimeout(timer);
        void this.handleMessage(event);
      };
    });
  }

  /**
   * Send a raw audio chunk to the agent for speech recognition.
   *
   * @param chunk - Raw PCM16 mono audio at the rate reported by the input
   *   provider (16 kHz by default). The buffer is base64-encoded into a
   *   `realtimeInput` JSON frame tagged with that rate.
   *
   * @remarks
   * No-op when the WebSocket is not open — audio sent before {@link connect}
   * completes or after the socket closes is silently dropped.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.sendJson({
      realtimeInput: {
        audio: {
          data: arrayBufferToBase64(chunk),
          mimeType: `audio/pcm;rate=${this.inputSampleRate}`,
        },
      },
    });
  }

  /**
   * Record the input provider's capture rate.
   *
   * @remarks
   * The rate travels with each frame in the `mimeType`, so a caller-supplied
   * microphone at a non-default rate needs no resampling — it just has to be
   * labelled honestly, or the server hears the speech at the wrong speed.
   *
   * @param metadata - The input provider's audio format.
   */
  override configureInputFormat(metadata: AudioMetadata): void {
    this.inputSampleRate = metadata.sampleRate;
  }

  protected emitOutputMetadata(): void {
    this.metadataCallback?.({
      sampleRate: OUTPUT_SAMPLE_RATE,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Gemini-specific public API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Register a callback for Gemini Live agent events.
   *
   * @param callback - Invoked synchronously per event. Only one callback is
   *   active at a time; calling this again replaces the previous one.
   *
   * @see {@link GeminiLiveAgentEvent} for the event union
   */
  onAgentEvent(callback: (event: GeminiLiveAgentEvent) => void): void {
    this.agentEventCallback = callback;
  }

  /**
   * Inject a text message as if the user typed it, and request a response.
   *
   * @param text - The user message content.
   *
   * @remarks
   * Sends a `clientContent` message with `turnComplete: true`, so the agent
   * answers in speech without any audio input.
   */
  sendUserMessage(text: string): void {
    this.sendJson({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    });
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

  /**
   * Parse a WebSocket frame into JSON.
   *
   * @remarks
   * The Live API delivers JSON messages as binary frames in browsers, so
   * the payload may be a string, `ArrayBuffer`, or `Blob`.
   */
  private async handleMessage(event: MessageEvent): Promise<void> {
    let text: string;
    const data: unknown = event.data;

    if (typeof data === 'string') {
      text = data;
    } else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      text = await data.text();
    } else {
      this.logger.warn('GeminiLiveAgent: unrecognized WebSocket frame type, ignoring');
      return;
    }

    let msg: GeminiServerMessage;
    try {
      msg = JSON.parse(text) as GeminiServerMessage;
    } catch {
      this.logger.warn('GeminiLiveAgent: failed to parse WebSocket message');
      return;
    }

    this.handleServerMessage(msg);
  }

  private handleServerMessage(msg: GeminiServerMessage): void {
    if (msg.setupComplete) {
      this.setupComplete = true;
      this.emitOutputMetadata();
      this.connectResolve?.();
      this.connectResolve = null;
      this.connectReject = null;
      return;
    }

    if (msg.toolCall?.functionCalls?.length) {
      void this.handleToolCall(msg.toolCall.functionCalls);
      return;
    }

    if (msg.goAway) {
      this.logger.warn(
        `GeminiLiveAgent: server closing soon (timeLeft: ${msg.goAway.timeLeft ?? 'unknown'})`
      );
      this.emitEvent({
        type: 'go_away',
        ...(msg.goAway.timeLeft !== undefined ? { timeLeft: msg.goAway.timeLeft } : {}),
      });
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    // User transcript fragments accumulate until the model starts responding
    if (content.inputTranscription?.text) {
      this.inputTranscript += content.inputTranscription.text;
    }

    if (content.outputTranscription?.text) {
      this.flushUserTurn();
      this.outputTranscript += content.outputTranscription.text;
    }

    // Model audio (and any inline text) parts
    if (content.modelTurn?.parts?.length) {
      this.flushUserTurn();
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data && (part.inlineData.mimeType ?? '').startsWith('audio/')) {
          this.emitAudioChunk(base64ToArrayBuffer(part.inlineData.data));
        }
        if (part.text) {
          this.outputTranscript += part.text;
        }
      }
    }

    if (content.interrupted) {
      // Barge-in: the server stopped generating. Discard the partial
      // response and unblock any pending finalize().
      //
      // The Live API sends no turnComplete for a generation it aborted, so
      // the turn state has to be reset here too — otherwise userTurnEmitted
      // stays true and flushUserTurn() silently swallows every later turn.
      this.emitEvent({ type: 'interrupted' });
      this.outputTranscript = '';
      this.userTurnEmitted = false;
      this.clearBufferedAssistantText();
      this.markAudioDone();
      return;
    }

    if (content.turnComplete) {
      const assistantText = this.outputTranscript.trim();
      this.outputTranscript = '';
      this.userTurnEmitted = false;
      if (assistantText) {
        this.emitEvent({ type: 'conversation_text', role: 'assistant', content: assistantText });
        this.emitAssistantText(assistantText);
      }
      this.emitEvent({ type: 'turn_complete' });
      this.markAudioDone();
    }
  }

  /**
   * Emit the accumulated user transcript when the model starts responding.
   *
   * @remarks
   * The Live API has no explicit end-of-utterance marker for the user's
   * speech — the first model output is the turn boundary.
   */
  private flushUserTurn(): void {
    if (this.userTurnEmitted) return;
    const text = this.inputTranscript.trim();
    this.inputTranscript = '';
    this.userTurnEmitted = true;
    if (text) {
      this.emitEvent({ type: 'conversation_text', role: 'user', content: text });
      this.emitUserTranscription(text);
    }
  }

  private async handleToolCall(
    calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>
  ): Promise<void> {
    const normalized: GeminiLiveFunctionCall[] = calls.map((call) => ({
      id: call.id ?? '',
      name: call.name ?? '',
      args: call.args ?? {},
    }));

    this.emitEvent({ type: 'function_call', calls: normalized });

    const handler = this.config.onFunctionCall;
    if (!handler) return;

    const functionResponses: Array<Record<string, unknown>> = [];
    for (const call of normalized) {
      try {
        const result = await handler(call);
        functionResponses.push({ id: call.id, name: call.name, response: result.response });
      } catch (err) {
        functionResponses.push({
          id: call.id,
          name: call.name,
          response: { error: String(err) },
        });
      }
    }

    this.sendJson({ toolResponse: { functionResponses } });
  }

  private handleClose(event: CloseEvent): void {
    this.logger.info(
      `GeminiLiveAgent: WebSocket closed (code: ${event.code}, reason: "${event.reason}")`
    );
    this.ws = null;
    this.setupComplete = false;
    this.inputTranscript = '';
    this.outputTranscript = '';
    this.userTurnEmitted = false;
    this.cleanupPendingState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal: setup message + helpers
  // ═══════════════════════════════════════════════════════════════════════

  private buildSetup(): Record<string, unknown> {
    const model = this.config.model.startsWith('models/')
      ? this.config.model
      : `models/${this.config.model}`;

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
    };
    if (this.config.temperature !== undefined) {
      generationConfig.temperature = this.config.temperature;
    }
    if (this.config.voice || this.config.language) {
      generationConfig.speechConfig = {
        ...(this.config.voice
          ? { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.config.voice } } }
          : {}),
        ...(this.config.language ? { languageCode: this.config.language } : {}),
      };
    }

    const setup: Record<string, unknown> = {
      model,
      generationConfig,
    };

    if (this.config.systemInstruction) {
      setup.systemInstruction = { parts: [{ text: this.config.systemInstruction }] };
    }
    if (this.config.inputTranscription !== false) {
      setup.inputAudioTranscription = {};
    }
    if (this.config.outputTranscription !== false) {
      setup.outputAudioTranscription = {};
    }
    if (this.config.functionDeclarations?.length) {
      setup.tools = [
        {
          functionDeclarations: this.config.functionDeclarations.map((fn) => ({
            name: fn.name,
            ...(fn.description ? { description: fn.description } : {}),
            ...(fn.parameters ? { parameters: fn.parameters } : {}),
          })),
        },
      ];
    }

    return { setup: { ...setup, ...this.config.setupOverrides } };
  }

  /**
   * Build the WebSocket URL for the BidiGenerateContent endpoint.
   *
   * @remarks
   * Direct mode appends the API key as the `key` query parameter (browser
   * WebSockets cannot set headers). Proxy mode omits it — the proxy appends
   * the key server-side.
   */
  private async buildWebSocketUrl(): Promise<string> {
    const base = this.resolveBaseUrl(GEMINI_LIVE_BASE) ?? GEMINI_LIVE_BASE;
    if (this.isProxyMode) {
      return `${base}${GEMINI_LIVE_PATH}`;
    }
    const apiKey = await this.resolveApiKey();
    return `${base}${GEMINI_LIVE_PATH}?key=${encodeURIComponent(apiKey)}`;
  }

  private sendJson(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emitEvent(event: GeminiLiveAgentEvent): void {
    this.agentEventCallback?.(event);
  }
}
