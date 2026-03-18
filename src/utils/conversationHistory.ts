/**
 * Utility functions for conversation history management.
 *
 * @remarks
 * Provides the core trimming logic used by {@link CompositeVoice} to keep
 * conversation history within configured limits. The trimming function is
 * exported as a pure function to enable direct unit testing.
 *
 * @packageDocumentation
 */

import type { LLMMessage } from '../core/types/providers';
import type { ConversationHistoryConfig } from '../core/types/config';

/**
 * Estimates the token count of a message using a chars/4 heuristic.
 *
 * @remarks
 * This is a coarse approximation — roughly 1 token per 4 characters.
 * Actual token counts vary by model and language. This heuristic is
 * intentionally simple and fast; it is not a substitute for a real tokenizer.
 *
 * @param content - The text content to estimate
 * @returns Estimated token count (always at least 1 for non-empty content)
 *
 * @internal
 */
export function estimateTokens(content: string): number {
  if (content.length === 0) return 0;
  return Math.ceil(content.length / 4);
}

/**
 * Estimates the total token count of an array of messages.
 *
 * @param messages - The messages to estimate
 * @returns Sum of estimated token counts
 *
 * @internal
 */
export function estimateMessagesTokens(messages: LLMMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

/**
 * Trims conversation history based on `maxTurns` and/or `maxTokens` constraints.
 *
 * @remarks
 * This is a pure function — it does not mutate the input array and returns a
 * new trimmed array.
 *
 * **Trimming order:**
 * 1. If `preserveSystemMessages` is not explicitly `false`, system messages are
 *    separated and will be preserved regardless of trimming.
 * 2. `maxTurns` trimming is applied first (each turn = 2 messages: user + assistant).
 * 3. `maxTokens` trimming is applied next, removing the oldest non-system messages
 *    until the total estimated token count (including system messages) fits within budget.
 * 4. When both limits are set, both are applied — the more restrictive result wins.
 *
 * @param history - The current conversation history array
 * @param config - The conversation history configuration
 * @returns A new array with trimmed history
 *
 * @internal
 */
export function trimConversationHistory(
  history: LLMMessage[],
  config: ConversationHistoryConfig
): LLMMessage[] {
  const maxTurns = config.maxTurns ?? 0;
  const maxTokens = config.maxTokens;
  const preserveSystem = config.preserveSystemMessages !== false;

  // Nothing to trim if both limits are unconstrained
  if (maxTurns <= 0 && maxTokens === undefined) return history;

  // Separate system messages if preservation is enabled
  let systemMessages: LLMMessage[] = [];
  let nonSystemMessages: LLMMessage[];

  if (preserveSystem) {
    systemMessages = history.filter((m) => m.role === 'system');
    nonSystemMessages = history.filter((m) => m.role !== 'system');
  } else {
    nonSystemMessages = [...history];
  }

  // Apply maxTurns trimming (each turn = 1 user + 1 assistant = 2 messages)
  if (maxTurns > 0 && nonSystemMessages.length > maxTurns * 2) {
    nonSystemMessages = nonSystemMessages.slice(-(maxTurns * 2));
  }

  // Apply maxTokens trimming — remove oldest non-system messages until budget is met
  if (maxTokens !== undefined && maxTokens > 0) {
    const systemTokens = estimateMessagesTokens(systemMessages);
    const budget = maxTokens - systemTokens;

    if (budget > 0) {
      while (nonSystemMessages.length > 0 && estimateMessagesTokens(nonSystemMessages) > budget) {
        nonSystemMessages.shift();
      }
    } else {
      // System messages alone exceed budget — keep only system messages
      nonSystemMessages = [];
    }
  }

  // Reassemble: system messages first, then remaining non-system messages
  return [...systemMessages, ...nonSystemMessages];
}
