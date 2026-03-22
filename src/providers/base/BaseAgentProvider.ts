/**
 * Abstract base class for "agent" providers that collapse STT + LLM + TTS
 * into a single persistent connection.
 *
 * @remarks
 * Agent providers (Deepgram Agent API, OpenAI Realtime, Gemini Live, Hume EVI,
 * ElevenLabs Conversational AI) share a common architecture:
 *
 * - A single WebSocket/connection handles the full audio-in → intelligence → audio-out pipeline
 * - The client sends raw audio and receives raw audio back
 * - Text events provide visibility into the conversation
 * - The connection is persistent — `disconnect()` is a no-op between turns
 * - The orchestrator sees three roles covered: `stt`, `llm`, `tts`
 *
 * ```
 * [MicrophoneInput] → InputQueue → [AgentProvider (stt+llm+tts)] → OutputQueue → [BrowserAudioOutput]
 * ```
 *
 * This base class provides:
 * - Role declaration (`['stt', 'llm', 'tts']`)
 * - No-op `disconnect()` (persistent connection)
 * - Async iterable bridge for `generateFromMessages()` (waits for server response)
 * - Per-turn audio-done tracking for `finalize()`
 * - Callback registration (`onTranscription`, `onAudio`, `onMetadata`)
 * - STT/LLM/TTS guard methods
 * - Keep-alive timer
 * - No-op `sendText()` / `processChunk()` (server handles TTS)
 *
 * Subclasses implement:
 * - `connect()` — provider-specific WebSocket handshake
 * - `sendAudio()` — send binary audio to the connection
 * - `onDispose()` — close the connection
 * - `emitOutputMetadata()` — tell the output provider the audio format
 *
 * Subclasses call these protected methods to drive the pipeline:
 * - `emitUserTranscription(text)` — trigger STT → LLM flow
 * - `emitAssistantText(text)` — resolve the pending LLM generator
 * - `emitAudioChunk(data)` — forward audio to the output
 * - `markAudioDone()` — resolve the pending `finalize()` call
 *
 * @example
 * ```typescript
 * class MyAgentProvider extends BaseAgentProvider {
 *   async connect(): Promise<void> {
 *     // Open WebSocket, complete handshake
 *   }
 *
 *   sendAudio(chunk: ArrayBuffer): void {
 *     // Send binary frame to the WebSocket
 *   }
 *
 *   protected async onDispose(): Promise<void> {
 *     // Close the WebSocket
 *   }
 *
 *   protected emitOutputMetadata(): void {
 *     // Call this.metadataCallback with the audio format
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

import { BaseProvider } from './BaseProvider';
import type { ProviderRole } from '../../core/types/roles';
import type {
  TranscriptionResult,
  LLMProviderConfig,
  LLMMessage,
  LLMGenerationOptions,
  STTProviderConfig,
  TTSProviderConfig,
} from '../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { Logger } from '../../utils/logger';
import type { BaseProviderConfig } from '../../core/types/providers';

/**
 * Abstract base class for agent providers that cover STT + LLM + TTS
 * in a single connection.
 *
 * @see {@link BaseProvider} for the root provider lifecycle
 * @see {@link LiveSTTProvider} for the STT interface contract
 * @see {@link LLMProvider} for the LLM interface contract
 * @see {@link LiveTTSProvider} for the TTS interface contract
 */
export abstract class BaseAgentProvider extends BaseProvider {
  public override readonly roles: readonly ProviderRole[] = ['stt', 'llm', 'tts'];

  /** Merged config satisfying STT + LLM + TTS duck-type checks. */
  public override readonly config: BaseProviderConfig & STTProviderConfig & LLMProviderConfig & TTSProviderConfig;

  // ─── Callbacks (set by orchestrator) ────────────────────────────────

  protected transcriptionCallback?: (result: TranscriptionResult) => void;
  protected audioCallback?: (chunk: AudioChunk) => void;
  protected metadataCallback?: (metadata: AudioMetadata) => void;

  // ─── Async bridges ─────────────────────────────────────────────────

  private pendingLLMResolve: ((text: string) => void) | null = null;
  private pendingLLMReject: ((err: Error) => void) | null = null;
  private audioDonePromise: Promise<void> | null = null;
  private audioDoneResolve: (() => void) | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: BaseProviderConfig & { model?: string }, logger?: Logger) {
    super('websocket', config, logger);
    this.config = {
      ...config,
      model: config.model ?? 'agent-managed',
    } as BaseProviderConfig & STTProviderConfig & LLMProviderConfig & TTSProviderConfig;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Abstract — subclasses must implement
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Open the connection and complete the provider-specific handshake.
   *
   * @remarks
   * Must resolve only after the connection is fully ready for audio.
   * Subclasses should establish the WebSocket, negotiate protocol settings,
   * and call {@link emitOutputMetadata} before resolving.
   *
   * @returns A promise that resolves when the connection is ready to
   *   accept audio via {@link sendAudio}.
   * @throws {@link ProviderConnectionError} if the handshake fails or
   *   the connection cannot be established.
   *
   * @virtual
   */
  abstract connect(): Promise<void>;

  /**
   * Send raw audio to the agent as a binary frame.
   *
   * @param chunk - Raw PCM audio data to forward to the agent connection.
   *
   * @virtual
   */
  abstract sendAudio(chunk: ArrayBuffer): void;

  /**
   * Emit audio format metadata so the output provider can decode PCM.
   *
   * @remarks
   * Called after handshake and before each response turn (because
   * `BrowserAudioOutput.stop()` clears metadata during barge-in).
   * Subclasses should call `this.metadataCallback?.(metadata)`.
   *
   * @returns Nothing — metadata is delivered via the registered
   *   {@link metadataCallback}.
   *
   * @virtual
   */
  protected abstract emitOutputMetadata(): void;

  // ═══════════════════════════════════════════════════════════════════════
  // LiveSTTProvider interface
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Forward microphone audio to the agent connection.
   *
   * @remarks
   * Alias for {@link sendAudio} — called by the orchestrator's input queue.
   *
   * @param chunk - Raw PCM audio data from the microphone input.
   *
   * @see {@link sendAudio}
   */
  processAudio(chunk: ArrayBuffer): void {
    this.sendAudio(chunk);
  }

  /**
   * Register the transcription callback.
   *
   * @param callback - Invoked with a {@link TranscriptionResult} each time
   *   the agent emits a user transcription event.
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.transcriptionCallback = callback;
  }

  /**
   * No-op — the agent connection is persistent.
   *
   * @remarks
   * The orchestrator calls `stt.disconnect()` / `tts.disconnect()` during
   * turn-taking and barge-in. For agent providers, the connection must not
   * be torn down between turns. The real close happens in `dispose()`.
   */
  async disconnect(): Promise<void> {
    // Intentional no-op — agent connection is persistent
  }

  // ─── STT Guard Methods ─────────────────────────────────────────────

  /**
   * Check whether a transcription marks the end of an utterance.
   *
   * @param result - The transcription result to inspect.
   * @returns `true` when the result has `utteranceComplete` set.
   */
  isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.utteranceComplete === true;
  }

  /**
   * Check whether a transcription is a speculative preflight result.
   *
   * @remarks
   * Agent providers do not emit preflight results — always returns `false`.
   *
   * @param _result - The transcription result to inspect.
   * @returns Always `false` for agent providers.
   */
  isPreflight(_result: TranscriptionResult): boolean {
    return false;
  }

  /**
   * Check whether a transcription is an interim (non-final) result.
   *
   * @remarks
   * Agent providers only surface final transcriptions — always returns `false`.
   *
   * @param _result - The transcription result to inspect.
   * @returns Always `false` for agent providers.
   */
  isInterim(_result: TranscriptionResult): boolean {
    return false;
  }

  /**
   * Check whether a transcription is a final result.
   *
   * @param result - The transcription result to inspect.
   * @returns `true` when the result has `isFinal` set.
   */
  isFinal(result: TranscriptionResult): boolean {
    return result.isFinal;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LLMProvider interface
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate a response from a single user prompt.
   *
   * @remarks
   * Wraps the prompt in a `user` message and delegates to
   * {@link generateFromMessages}.
   *
   * @param prompt - The user's text input.
   * @param options - Optional generation overrides (only `signal` is
   *   meaningful for agent providers).
   * @returns An async iterable that yields the assistant's response as
   *   a single text chunk.
   * @throws `AbortError` if the supplied `options.signal` is aborted
   *   before the server responds.
   */
  async generate(
    prompt: string,
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    return this.generateFromMessages(
      [{ role: 'user', content: prompt }],
      options
    );
  }

  /**
   * Returns an async iterable that yields the assistant's response text.
   *
   * @remarks
   * Agent APIs manage their own conversation context. This method does NOT
   * re-send the message history — the server already has it. Instead, it
   * returns an iterable that blocks until the server sends the assistant's
   * response text, then yields it as a single chunk.
   *
   * The returned iterator resolves when the subclass calls
   * {@link emitAssistantText}. If the connection closes before a response
   * arrives, the iterator rejects via {@link rejectPendingLLM}.
   *
   * @param _messages - Conversation messages (ignored — the agent server
   *   maintains its own history).
   * @param _options - Optional generation overrides. Only `signal` is
   *   observed to support abort.
   * @returns An async iterable that yields the assistant's response as
   *   a single text chunk.
   * @throws `AbortError` if the supplied `_options.signal` is aborted
   *   before the server responds.
   */
  async generateFromMessages(
    _messages: LLMMessage[],
    _options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    const self = this;

    return {
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          async next(): Promise<IteratorResult<string>> {
            if (done) return { done: true, value: undefined };
            done = true;

            const text = await new Promise<string>((resolve, reject) => {
              self.pendingLLMResolve = resolve;
              self.pendingLLMReject = reject;

              if (_options?.signal) {
                if (_options.signal.aborted) {
                  reject(new DOMException('Aborted', 'AbortError'));
                  return;
                }
                _options.signal.addEventListener('abort', () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                  self.pendingLLMResolve = null;
                  self.pendingLLMReject = null;
                }, { once: true });
              }
            });

            return { done: false, value: text };
          },
        };
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LiveTTSProvider interface
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * No-op — TTS synthesis is handled server-side.
   *
   * @param _chunk - Text chunk (ignored by agent providers).
   */
  sendText(_chunk: string): void {}

  /**
   * No-op alias for {@link sendText}.
   *
   * @param _text - Text chunk (ignored by agent providers).
   */
  processChunk(_text: string): void {}

  /**
   * Wait for the agent to finish sending all audio for the current turn.
   *
   * @remarks
   * Resolves when the subclass calls {@link markAudioDone}, or after a
   * 30-second safety timeout — whichever comes first. The timeout prevents
   * the orchestrator from hanging indefinitely if the agent never signals
   * completion.
   *
   * @returns A promise that resolves when the current turn's audio is
   *   complete or the 30 s timeout elapses.
   */
  async finalize(): Promise<void> {
    if (!this.audioDonePromise) return;
    const promise = this.audioDonePromise;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    await Promise.race([promise, timeout]);
  }

  /**
   * Register the audio callback.
   *
   * @param callback - Invoked with an {@link AudioChunk} each time the
   *   agent sends a binary audio frame.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Register the metadata callback.
   *
   * @param callback - Invoked with an {@link AudioMetadata} object
   *   describing the audio format (sample rate, encoding, etc.).
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void {
    this.metadataCallback = callback;
  }

  /**
   * Check whether an audio chunk is ready for playback.
   *
   * @param chunk - The audio chunk to inspect.
   * @returns `true` when the chunk contains a non-empty audio buffer.
   */
  isAudioReady(chunk: AudioChunk): boolean {
    return chunk.data.byteLength > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Protected helpers — subclasses call these to drive the pipeline
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Emit a user transcription. Creates a new per-turn audio promise
   * and triggers the orchestrator's STT -> LLM flow.
   *
   * @param text - The transcribed user speech to forward to the
   *   orchestrator's transcription callback.
   */
  protected emitUserTranscription(text: string): void {
    // Fresh promise for this turn's audio completion
    this.audioDonePromise = new Promise<void>((resolve) => {
      this.audioDoneResolve = resolve;
    });

    this.transcriptionCallback?.({
      text,
      isFinal: true,
      utteranceComplete: true,
      confidence: 1,
    });
  }

  /**
   * Deliver the assistant's response text. Resolves the pending
   * {@link generateFromMessages} iterator.
   *
   * @param text - The assistant's response text received from the
   *   agent server.
   */
  protected emitAssistantText(text: string): void {
    if (this.pendingLLMResolve) {
      this.pendingLLMResolve(text);
      this.pendingLLMResolve = null;
      this.pendingLLMReject = null;
    }
  }

  /**
   * Forward a binary audio chunk to the output provider.
   *
   * @param data - Raw audio bytes to deliver via the registered
   *   {@link audioCallback}. Zero-length buffers are silently dropped.
   */
  protected emitAudioChunk(data: ArrayBuffer): void {
    if (data.byteLength === 0) return;
    this.audioCallback?.({
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Signal that all audio for the current turn has been sent.
   * Resolves the pending `finalize()` call.
   */
  protected markAudioDone(): void {
    if (this.audioDoneResolve) {
      this.audioDoneResolve();
      this.audioDoneResolve = null;
    }
  }

  /**
   * Reject the pending LLM generator with an error.
   *
   * @param error - The error to propagate to the pending
   *   {@link generateFromMessages} iterator.
   */
  protected rejectPendingLLM(error: Error): void {
    if (this.pendingLLMReject) {
      this.pendingLLMReject(error);
      this.pendingLLMResolve = null;
      this.pendingLLMReject = null;
    }
  }

  /**
   * Start an auto keep-alive timer. Call from your handshake completion.
   *
   * @param intervalMs - Interval in milliseconds between keep-alive
   *   pings. Defaults to `8000` (8 seconds).
   * @param sendFn - Callback invoked on each tick to send the
   *   provider-specific keep-alive message.
   *
   * @example
   * ```ts
   * this.startKeepAlive(8_000, () => {
   *   this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
   * });
   * ```
   */
  protected startKeepAlive(intervalMs = 8_000, sendFn: () => void): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(sendFn, intervalMs);
  }

  /** Stop the keep-alive timer. */
  protected stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Clean up all pending promises and timers. Call from your `onDispose()`
   * or connection close handler.
   */
  protected cleanupPendingState(): void {
    this.stopKeepAlive();
    this.pendingLLMReject?.(new Error(`${this.constructor.name}: connection closed`));
    this.pendingLLMResolve = null;
    this.pendingLLMReject = null;
    this.audioDoneResolve?.();
    this.audioDoneResolve = null;
    this.audioDonePromise = null;
  }
}
