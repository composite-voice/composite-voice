/**
 * Type-safe event emitter for the CompositeVoice SDK.
 *
 * @remarks
 * This module provides the {@link EventEmitter} class, which underpins all event
 * communication within the SDK. It supports strongly-typed events via the
 * {@link EventListenerMap} interface, wildcard (`'*'`) subscriptions, one-time
 * listeners, configurable maximum listener limits, and both synchronous and
 * asynchronous emission modes.
 *
 * @packageDocumentation
 */

import type { EventType, EventListener, EventListenerMap, CompositeVoiceEvent } from './types';

/**
 * A type-safe event emitter with support for wildcard listeners and both
 * synchronous and asynchronous event dispatch.
 *
 * @remarks
 * `EventEmitter` is the internal event bus used by {@link CompositeVoice} to
 * propagate pipeline events (transcription, LLM, TTS, agent lifecycle, and
 * audio events) to consumer code. Key features include:
 *
 * - **Type safety**: Listeners are typed according to the event they subscribe
 *   to, so TypeScript enforces correct event payloads at compile time.
 * - **Wildcard support**: Subscribing to `'*'` receives every event, useful
 *   for logging or debugging.
 * - **One-time listeners**: The {@link EventEmitter.once | once()} method
 *   automatically removes the listener after the first invocation.
 * - **Memory leak detection**: A configurable maximum listener count per event
 *   emits a console warning when exceeded, helping catch subscription leaks.
 * - **Dual emission modes**: {@link EventEmitter.emit | emit()} awaits all
 *   listeners (including async ones), while {@link EventEmitter.emitSync | emitSync()}
 *   fires listeners without awaiting, suitable for hot paths.
 *
 * @example Subscribing to typed events
 * ```typescript
 * const emitter = new EventEmitter();
 *
 * // Typed listener -- TypeScript knows the event shape
 * emitter.on('transcription.final', ({ text, confidence }) => {
 *   console.log(`Final transcript: ${text} (confidence: ${confidence})`);
 * });
 *
 * // Wildcard listener for logging
 * emitter.on('*', (event) => {
 *   console.log(`[${event.type}]`, event);
 * });
 * ```
 *
 * @example One-time listener with unsubscribe
 * ```typescript
 * const unsubscribe = emitter.once('agent.ready', () => {
 *   console.log('Agent is ready');
 * });
 *
 * // If you need to cancel before it fires:
 * unsubscribe();
 * ```
 *
 * @see {@link EventType} for the full list of event type strings.
 * @see {@link EventListenerMap} for the mapping of event types to listener signatures.
 * @see {@link CompositeVoiceEvent} for the union of all event payload types.
 */
export class EventEmitter {
  private listeners: Map<EventType | '*', Set<EventListener>>;
  private maxListeners: number;

  /**
   * Creates a new `EventEmitter` instance.
   *
   * @param maxListeners - The maximum number of listeners allowed per event
   *   type before a memory leak warning is logged to the console. Defaults
   *   to `100`.
   */
  constructor(maxListeners = 100) {
    this.listeners = new Map();
    this.maxListeners = maxListeners;
  }

  /**
   * Registers an event listener for the specified event type.
   *
   * @remarks
   * If the number of listeners for the given event exceeds the configured
   * maximum (see {@link EventEmitter.setMaxListeners | setMaxListeners()}), a
   * warning is logged to the console to help detect memory leaks. The listener
   * is stored in a `Set`, so adding the same function reference twice for the
   * same event is a no-op.
   *
   * @typeParam T - The event type string, inferred from the `event` argument.
   *
   * @param event - The event type to listen for (e.g., `'llm.chunk'`), or
   *   `'*'` to receive all events.
   * @param listener - The callback function invoked when the event fires.
   * @returns A function that, when called, removes this listener (equivalent
   *   to calling {@link EventEmitter.off | off()}).
   *
   * @example
   * ```typescript
   * const unsubscribe = emitter.on('tts.complete', () => {
   *   console.log('TTS playback finished');
   * });
   *
   * // Later, remove the listener
   * unsubscribe();
   * ```
   */
  on<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? EventListener : EventListenerMap[T]
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      throw new Error(`Failed to get event listeners for ${event}`);
    }

    if (eventListeners.size >= this.maxListeners) {
      console.warn(
        `Warning: Possible EventEmitter memory leak detected. ${eventListeners.size} listeners added for event "${event}". ` +
          `Use emitter.setMaxListeners() to increase limit.`
      );
    }

    eventListeners.add(listener as EventListener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Registers a one-time event listener that automatically unsubscribes after
   * its first invocation.
   *
   * @remarks
   * Internally, this wraps the provided listener in a function that calls
   * {@link EventEmitter.off | off()} before invoking the original callback.
   * The returned unsubscribe function can be called to cancel the listener
   * before it fires.
   *
   * @typeParam T - The event type string, inferred from the `event` argument.
   *
   * @param event - The event type to listen for.
   * @param listener - The callback function invoked once when the event fires.
   * @returns A function that, when called, removes this listener before it
   *   has a chance to fire.
   *
   * @example
   * ```typescript
   * emitter.once('agent.ready', () => {
   *   console.log('This will only fire once');
   * });
   * ```
   */
  once<T extends EventType>(event: T, listener: EventListenerMap[T]): () => void {
    const wrappedListener = ((evt: CompositeVoiceEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.off(event, wrappedListener as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void listener(evt as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    return this.on(event, wrappedListener);
  }

  /**
   * Remove an event listener
   * @param event Event type
   * @param listener Listener function to remove
   */
  off<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? EventListener : EventListenerMap[T]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener as EventListener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   * @param event Optional event type to remove listeners for
   */
  removeAllListeners(event?: EventType | '*'): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Emit an event to all registered listeners
   * @param event Event object to emit
   */
  async emit<T extends CompositeVoiceEvent>(event: T): Promise<void> {
    const eventListeners = this.listeners.get(event.type);
    const wildcardListeners = this.listeners.get('*');

    const allListeners = [...(eventListeners || []), ...(wildcardListeners || [])];

    // Execute all listeners
    await Promise.all(
      allListeners.map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          console.error(`Error in event listener for "${event.type}":`, error);
        }
      })
    );
  }

  /**
   * Emit an event synchronously (doesn't wait for async listeners)
   * @param event Event object to emit
   */
  emitSync<T extends CompositeVoiceEvent>(event: T): void {
    const eventListeners = this.listeners.get(event.type);
    const wildcardListeners = this.listeners.get('*');

    const allListeners = [...(eventListeners || []), ...(wildcardListeners || [])];

    // Execute all listeners without awaiting
    for (const listener of allListeners) {
      try {
        void listener(event);
      } catch (error) {
        console.error(`Error in event listener for "${event.type}":`, error);
      }
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event Event type
   * @returns Number of listeners
   */
  listenerCount(event: EventType | '*'): number {
    const eventListeners = this.listeners.get(event);
    return eventListeners ? eventListeners.size : 0;
  }

  /**
   * Get all event types that have listeners
   * @returns Array of event types
   */
  eventNames(): (EventType | '*')[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Set the maximum number of listeners per event
   * @param n Maximum number of listeners
   */
  setMaxListeners(n: number): void {
    this.maxListeners = n;
  }

  /**
   * Get the maximum number of listeners per event
   * @returns Maximum number of listeners
   */
  getMaxListeners(): number {
    return this.maxListeners;
  }
}
