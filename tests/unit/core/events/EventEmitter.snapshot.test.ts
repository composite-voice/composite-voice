/**
 * EventEmitter snapshot tests
 */

import { EventEmitter } from '../../../../src/core/events/EventEmitter';
import type { AgentReadyEvent, TranscriptionFinalEvent } from '../../../../src/core/events/types';

describe('EventEmitter Snapshots', () => {
  it('should match event structure snapshot', () => {
    const event: AgentReadyEvent = {
      type: 'agent.ready',
      timestamp: 1234567890,
    };

    expect(event).toMatchSnapshot();
  });

  it('should match transcription event snapshot', () => {
    const event: TranscriptionFinalEvent = {
      type: 'transcription.final',
      text: 'Hello world',
      confidence: 0.95,
      timestamp: 1234567890,
      metadata: {
        model: 'nova-2',
        language: 'en-US',
      },
    };

    expect(event).toMatchSnapshot();
  });

  it('should match emitter state snapshot', () => {
    const emitter = new EventEmitter(5);

    emitter.on('agent.ready', () => {});
    emitter.on('transcription.final', () => {});
    emitter.on('*', () => {});

    const state = {
      maxListeners: emitter.getMaxListeners(),
      eventNames: emitter.eventNames(),
      listenerCounts: {
        'agent.ready': emitter.listenerCount('agent.ready'),
        'transcription.final': emitter.listenerCount('transcription.final'),
        '*': emitter.listenerCount('*'),
      },
    };

    expect(state).toMatchSnapshot();
  });
});
