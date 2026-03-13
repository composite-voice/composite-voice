/**
 * @packageDocumentation
 * Collaborator classes extracted from CompositeVoice to decompose the
 * god object into focused, independently testable modules.
 *
 * @remarks
 * These classes are internal implementation details of the CompositeVoice
 * pipeline. They are exported for advanced usage and testing but are not
 * part of the primary public API.
 *
 * - {@link ConversationManager} -- history accumulation, trimming, I/O context
 * - {@link TurnTakingController} -- pause/resume capture during playback
 * - {@link EagerLLMController} -- speculative generation lifecycle
 * - {@link AudioRouter} -- queue creation, wiring, drain management
 */

export { ConversationManager } from './ConversationManager';
export { TurnTakingController } from './TurnTakingController';
export { EagerLLMController } from './EagerLLMController';
export type { ReconcileResult } from './EagerLLMController';
export { AudioRouter } from './AudioRouter';
