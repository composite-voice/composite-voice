/**
 * Runtime validation at the Jev HTTP boundary.
 * @packageDocumentation
 */

import type { JevQuestions, JevResponse } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function keysMatch(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function distribution(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keysMatch(value, keys) && Object.values(value).every(probability);
}

/** Reject unusable questions before making a paid request. */
export function validateJevQuestions(questions: JevQuestions): void {
  if (!record(questions) || Object.keys(questions).length === 0) {
    throw new Error('Jev requires at least one question');
  }
  for (const question of Object.values(questions)) {
    if (!record(question)) throw new Error('Invalid Jev question');
    if (question.type === 'noul') continue;
    if (
      question.type === 'choice' &&
      record(question.criteria) &&
      Object.keys(question.criteria).length
    ) {
      continue;
    }
    if (question.type === 'score' && Array.isArray(question.criteria) && question.criteria.length) {
      continue;
    }
    throw new Error('Jev questions must use noul, choice, or score with non-empty criteria');
  }
}

/** A malformed response must throw so the guardrail failure policy can apply. */
export function validateJevResponse<Q extends JevQuestions>(
  value: unknown,
  questions: Q
): asserts value is JevResponse<Q> {
  const invalid = (): never => {
    throw new Error('Invalid Jev response');
  };
  if (!record(value) || typeof value.model !== 'string' || !value.model.trim()) return invalid();
  const usage = value.usage;
  if (
    !record(usage) ||
    !['input_tokens', 'output_tokens'].every((key) => {
      const count = usage[key];
      return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
    })
  )
    return invalid();
  if (!record(value.answers) || !keysMatch(value.answers, Object.keys(questions))) return invalid();

  for (const [key, question] of Object.entries(questions)) {
    const answer = value.answers[key];
    if (!record(answer) || answer.type !== question.type) return invalid();
    switch (question.type) {
      case 'noul':
        if (!probability(answer.noul)) return invalid();
        break;
      case 'choice': {
        const choices = Object.keys(question.criteria);
        if (
          typeof answer.choice !== 'string' ||
          !choices.includes(answer.choice) ||
          !probability(answer.confidence) ||
          !distribution(answer.probabilities, choices)
        )
          return invalid();
        break;
      }
      case 'score': {
        const levels = question.criteria.map((_, index) => String(index));
        if (
          typeof answer.score !== 'number' ||
          !Number.isFinite(answer.score) ||
          answer.score < 0 ||
          answer.score > levels.length - 1 ||
          !probability(answer.confidence) ||
          !distribution(answer.probabilities, levels) ||
          !record(answer.legend) ||
          !keysMatch(answer.legend, levels) ||
          !Object.values(answer.legend).every(
            (entry) => typeof entry === 'string' || record(entry) || Array.isArray(entry)
          )
        )
          return invalid();
        break;
      }
    }
  }
}
