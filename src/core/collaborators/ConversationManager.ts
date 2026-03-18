/**
 * Manages conversation history accumulation, trimming, and I/O context
 * message building for the CompositeVoice pipeline.
 *
 * @remarks
 * Extracted from CompositeVoice to encapsulate all conversation history
 * concerns in a single, independently testable class. CompositeVoice
 * delegates history management to this collaborator.
 *
 * @packageDocumentation
 */

import type { LLMMessage } from '../types/providers';
import type { ConversationHistoryConfig } from '../types/config';
import type { Logger } from '../../utils/logger';

/**
 * Manages multi-turn conversation history for the LLM pipeline.
 *
 * @remarks
 * Handles accumulation of user and assistant messages, enforces the
 * `maxTurns` limit, and builds I/O context messages that inform the LLM
 * about the current interaction modality (voice vs text).
 */
export class ConversationManager {
  private history: LLMMessage[] = [];

  constructor(
    private config?: ConversationHistoryConfig,
    private logger?: Logger
  ) {}

  /** Whether conversation history is enabled in the configuration. */
  get enabled(): boolean {
    return this.config?.enabled === true;
  }

  /**
   * Add a user message to the conversation history.
   *
   * @param text - The user's message text.
   * @param modality - How the message was input ('voice' or 'text').
   */
  addUserMessage(text: string, modality?: 'voice' | 'text'): void {
    if (!this.enabled) return;

    const msg: LLMMessage = { role: 'user', content: text };
    if (modality) {
      msg.modality = modality;
    }
    this.history.push(msg);
    this.trimHistory();
  }

  /**
   * Add an assistant message to the conversation history.
   *
   * @param text - The assistant's response text.
   */
  addAssistantMessage(text: string): void {
    if (!this.enabled || !text) return;

    this.history.push({ role: 'assistant', content: text });
  }

  /**
   * Add an arbitrary message to the conversation history.
   *
   * @remarks
   * Used for tool-call messages (role: 'assistant' with toolCalls, or
   * role: 'tool' with toolCallId) that don't fit the simple user/assistant pattern.
   *
   * @param message - The message to add.
   */
  addMessage(message: LLMMessage): void {
    this.history.push(message);
  }

  /**
   * Returns a shallow copy of the current conversation history.
   */
  getMessages(): LLMMessage[] {
    return [...this.history];
  }

  /**
   * Returns the raw internal history array (by reference).
   *
   * @remarks
   * Used by CompositeVoice when building message arrays for tool loops
   * that need to mutate the array in place.
   */
  getMessagesRef(): LLMMessage[] {
    return this.history;
  }

  /**
   * Clears all accumulated conversation history.
   */
  clear(): void {
    this.history = [];
    this.logger?.debug('Conversation history cleared');
  }

  /**
   * Build an I/O context system message that tells the LLM about the
   * current interaction modality.
   *
   * @param modality - How this specific message was input.
   * @param inputMuted - Whether the microphone is currently muted.
   * @param outputMuted - Whether audio output is currently muted.
   * @returns An LLMMessage with role 'system' describing the I/O context.
   */
  buildIOContextMessage(
    modality: 'voice' | 'text',
    inputMuted: boolean,
    outputMuted: boolean
  ): LLMMessage {
    const inputMode = inputMuted ? 'text' : 'voice';
    const outputMode = outputMuted ? 'text' : 'voice';

    const parts: string[] = [];

    if (inputMode === 'voice') {
      parts.push(
        'The user is speaking to you through a microphone (speech-to-text). You can hear them.'
      );
    } else {
      parts.push('The user is typing to you. Their microphone is off, so you cannot hear them.');
    }

    if (outputMode === 'voice') {
      parts.push(
        'Your response will be spoken aloud via text-to-speech. The user can hear you. Keep responses concise and conversational. Avoid markdown, code blocks, or long lists — the user is listening, not reading.'
      );
    } else {
      parts.push(
        'Your response will be displayed as text only. The user cannot hear you. You may use markdown formatting, code blocks, links, and structured content.'
      );
    }

    if (modality !== inputMode) {
      parts.push(`Note: this specific message was ${modality === 'text' ? 'typed' : 'spoken'}.`);
    }

    return {
      role: 'system',
      content: `[I/O Context] ${parts.join(' ')}`,
    };
  }

  /**
   * Get the full message list for an LLM call, including I/O context
   * and conversation history.
   *
   * @param modality - How this specific message was input.
   * @param inputMuted - Whether the microphone is currently muted.
   * @param outputMuted - Whether audio output is currently muted.
   * @returns Array of LLMMessage ready to send to the LLM.
   */
  getMessagesForLLM(
    modality: 'voice' | 'text',
    inputMuted: boolean,
    outputMuted: boolean
  ): LLMMessage[] {
    const ioContext = this.buildIOContextMessage(modality, inputMuted, outputMuted);
    return [ioContext, ...this.history];
  }

  /**
   * Trim conversation history based on the maxTurns configuration.
   */
  private trimHistory(): void {
    const maxTurns = this.config?.maxTurns ?? 0;
    if (maxTurns > 0 && this.history.length > maxTurns * 2) {
      this.history = this.history.slice(-(maxTurns * 2));
    }
  }
}
