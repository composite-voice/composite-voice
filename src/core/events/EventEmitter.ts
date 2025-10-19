/**
 * Type-safe event emitter for CompositeVoice SDK
 */

import type { EventType, EventListener, EventListenerMap, CompositeVoiceEvent } from './types';

/**
 * Type-safe event emitter with support for wildcard listeners
 */
export class EventEmitter {
  private listeners: Map<EventType | '*', Set<EventListener>>;
  private maxListeners: number;

  constructor(maxListeners = 100) {
    this.listeners = new Map();
    this.maxListeners = maxListeners;
  }

  /**
   * Register an event listener
   * @param event Event type to listen for, or '*' for all events
   * @param listener Listener function
   * @returns Unsubscribe function
   */
  on<T extends EventType>(
    event: T | '*',
    listener: T extends '*' ? EventListener : EventListenerMap[T]
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;

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
   * Register a one-time event listener
   * @param event Event type to listen for
   * @param listener Listener function
   * @returns Unsubscribe function
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
