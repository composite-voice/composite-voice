/**
 * Types for TypeSafe's native Jev decision API.
 *
 * @see https://api.typesafe.ai/openapi.json
 * @packageDocumentation
 */

/** Content evaluated by Jev. It produces decisions, not generated text. */
export type JevState = string | Record<string, unknown> | readonly unknown[];

/** Instructions and criterion descriptions may also be omitted or null. */
export type JevDescription = JevState | null;

/** A yes/no question, answered with the probability of true. */
export interface JevNoulQuestion {
  type: 'noul';
  instructions?: JevDescription;
  criteria?: { true?: JevDescription; false?: JevDescription } | null;
}

/** Select one of the named criteria. */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions?: JevDescription;
  criteria: Readonly<Record<string, JevDescription>>;
}

/** Rate content against an ordered rubric, indexed from zero. */
export interface JevScoreQuestion {
  type: 'score';
  instructions?: JevDescription;
  criteria: readonly JevState[];
}

/** The three question types accepted by the native API. */
export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

/** Named questions evaluated together against the same state. */
export type JevQuestions = Readonly<Record<string, JevQuestion>>;

/** Probability of true, in [0, 1]; values near 0.5 express uncertainty. */
export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

/** Selected criterion, confidence, and probabilities for all choices. */
export interface JevChoiceAnswer<Choice extends string = string> {
  type: 'choice';
  choice: Choice;
  confidence: number;
  probabilities: Record<Choice, number>;
}

/** Expected rubric index (possibly fractional), confidence, and distribution. */
export interface JevScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  legend: Record<string, JevState>;
  probabilities: Record<string, number>;
}

/** Infer an answer's type from its question. */
export type JevAnswer<Q extends JevQuestion = JevQuestion> = Q extends JevNoulQuestion
  ? JevNoulAnswer
  : Q extends JevChoiceQuestion
    ? JevChoiceAnswer<Extract<keyof Q['criteria'], string>>
    : JevScoreAnswer;

/** Validated answers, resolved model name, and token usage. */
export interface JevResponse<Q extends JevQuestions = JevQuestions> {
  model: string;
  answers: { [K in keyof Q]: JevAnswer<Q[K]> };
  usage: { input_tokens: number; output_tokens: number };
}

/** One evaluation. A per-request model overrides the client's default. */
export interface JevRequest<Q extends JevQuestions = JevQuestions> {
  state: JevState;
  questions: Q;
  model?: string;
}
