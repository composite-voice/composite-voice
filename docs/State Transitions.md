# State Transitions

Complete guide to valid state transitions in CompositeVoice state machines.

## AudioCaptureStateMachine

**States**: `idle | starting | active | paused | stopped | error`

### Valid Transitions

```typescript
const CAPTURE_TRANSITIONS = {
  idle: ['starting', 'error'],
  starting: ['active', 'error'],
  active: ['paused', 'stopped', 'error'],
  paused: ['active', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};
```

### Flow Diagrams

**Success Path:**

```
idle → starting → active → stopped → idle
```

**With Pause (during TTS):**

```
idle → starting → active → paused → active → stopped → idle
```

**Error Recovery:**

```
idle → starting → error → idle → starting → active
```

### Example Usage

```typescript
// Starting capture
captureStateMachine.setStarting(); // idle → starting
await stt.connect();
captureStateMachine.setActive(); // starting → active

// Pausing during TTS
captureStateMachine.setPaused(); // active → paused
await stt.disconnect();

// Resuming after TTS
await stt.connect();
captureStateMachine.setActive(); // paused → active

// Stopping
captureStateMachine.setStopped(); // active → stopped
captureStateMachine.setIdle(); // stopped → idle
```

---

## AudioPlaybackStateMachine

**States**: `idle | buffering | playing | paused | stopped | error`

### Valid Transitions

```typescript
const PLAYBACK_TRANSITIONS = {
  idle: ['buffering', 'error'],
  buffering: ['playing', 'stopped', 'error'],
  playing: ['paused', 'stopped', 'error'],
  paused: ['playing', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};
```

### Flow Diagrams

**Success Path (with actual playback):**

```
idle → buffering → playing → stopped → idle
```

**Success Path (direct completion):**

```
idle → buffering → stopped → idle
```

**Error Recovery:**

```
idle → buffering → error → idle
```

### Example Usage

```typescript
// Starting playback
playbackStateMachine.setBuffering(); // idle → buffering
await tts.synthesize(text);
playbackStateMachine.setStopped(); // buffering → stopped (or playing → stopped)
playbackStateMachine.setIdle(); // stopped → idle

// With explicit playing state
playbackStateMachine.setBuffering(); // idle → buffering
playbackStateMachine.setPlaying(); // buffering → playing
// ... playback happens ...
playbackStateMachine.setStopped(); // playing → stopped
playbackStateMachine.setIdle(); // stopped → idle
```

---

## ProcessingStateMachine

**States**: `idle | processing | streaming | complete | error`

### Valid Transitions

```typescript
const PROCESSING_TRANSITIONS = {
  idle: ['processing', 'error'],
  processing: ['streaming', 'complete', 'error'],
  streaming: ['complete', 'error'],
  complete: ['idle'],
  error: ['idle'],
};
```

### Flow Diagrams

**Success Path (with streaming):**

```
idle → processing → streaming → complete → idle
```

**Success Path (no streaming):**

```
idle → processing → complete → idle
```

**Error Recovery:**

```
idle → processing → error → idle
```

### Example Usage

```typescript
// Starting LLM processing
processingStateMachine.setProcessing(); // idle → processing

// Streaming response
processingStateMachine.setStreaming(); // processing → streaming
// ... chunks arrive ...

// Complete
processingStateMachine.setComplete(); // streaming → complete
processingStateMachine.setIdle(); // complete → idle

// Non-streaming path
processingStateMachine.setProcessing(); // idle → processing
processingStateMachine.setComplete(); // processing → complete
processingStateMachine.setIdle(); // complete → idle
```

---

## AgentStateMachine (Derived)

**States**: `idle | ready | listening | thinking | speaking | error`

### State Derivation Rules

```typescript
function deriveAgentState(capture, playback, processing) {
  // Priority order:

  if (any state machine is in 'error')
    return 'error';

  if (playback is 'playing' or 'buffering')
    return 'speaking';

  if (processing is 'processing' or 'streaming')
    return 'thinking';

  if (capture is 'active')
    return 'listening';

  if (all are 'idle')
    return 'ready';

  return 'ready';  // default
}
```

### Typical Flow

```
ready (all idle)
  ↓ user speaks
listening (capture: active)
  ↓ transcription received
thinking (processing: processing)
  ↓ LLM responds
speaking (playback: playing)
  ↓ TTS completes
listening (capture: active again)
```

---

## Common Patterns

### Pattern 1: Start Conversation

```typescript
// Initialize (once)
agentStateMachine.initialize(capture, playback, processing);
// State: idle → ready

// Start listening
captureStateMachine.setStarting();
await stt.connect();
captureStateMachine.setActive();
// State: ready → listening
```

### Pattern 2: Process User Input

```typescript
// User speaks, transcription received
processingStateMachine.setProcessing();
// State: listening → thinking

const response = await llm.generate(text);

processingStateMachine.setStreaming();
// State: still thinking

processingStateMachine.setComplete();
processingStateMachine.setIdle();
// State: thinking → ready (temporarily)
```

### Pattern 3: Speak Response (with Turn-Taking)

```typescript
// Pause capture (only if active)
const captureState = captureStateMachine.getState();
if (captureState === 'active') {
  captureStateMachine.setPaused();
  await stt.disconnect();
}

// Start playback
playbackStateMachine.setBuffering();
await tts.synthesize(text);
// State: thinking → speaking

// Complete playback
playbackStateMachine.setStopped();
playbackStateMachine.setIdle();
// State: speaking → ready (temporarily)

// Resume capture based on current state
const resumeState = captureStateMachine.getState();
if (resumeState === 'paused') {
  // paused → active (normal resume)
  await stt.connect();
  captureStateMachine.setActive();
} else if (resumeState === 'error') {
  // error → idle → starting → active (recovery)
  captureStateMachine.setIdle();
  captureStateMachine.setStarting();
  await stt.connect();
  captureStateMachine.setActive();
}
// State: ready → listening
```

### Pattern 4: Error Handling

```typescript
try {
  await tts.synthesize(text);
} catch (error) {
  // Set error state
  if (playbackStateMachine.getState() !== 'error') {
    playbackStateMachine.setError();
  }
  // State: speaking → error

  // Recover
  playbackStateMachine.setIdle(); // error → idle

  await stt.connect();
  captureStateMachine.setStarting();
  captureStateMachine.setActive();
  // State: error → listening
}
```

---

## Invalid Transitions

These transitions will throw errors:

### AudioCapture

- ❌ `idle → active` (must go through `starting`)
- ❌ `starting → paused` (must be `active` first)
- ❌ `paused → idle` (must go through `stopped`)

### AudioPlayback

- ❌ `idle → playing` (must go through `buffering`)
- ❌ `buffering → idle` (must go through `stopped`)
- ❌ `playing → idle` (must go through `stopped`)

### Processing

- ❌ `idle → streaming` (must start with `processing`)
- ❌ `idle → complete` (must process first)
- ❌ `streaming → idle` (must go through `complete`)

---

## Debugging Tips

### Check Current States

```typescript
const diagnostics = agentStateMachine.getDiagnostics();
console.log(diagnostics);
// {
//   agentState: 'speaking',
//   captureState: 'paused',
//   playbackState: 'playing',
//   processingState: 'idle'
// }
```

### Add State Change Listeners

```typescript
captureStateMachine.onStateChange((newState, oldState) => {
  console.log(`Capture: ${oldState} → ${newState}`);
});

playbackStateMachine.onStateChange((newState, oldState) => {
  console.log(`Playback: ${oldState} → ${newState}`);
});

processingStateMachine.onStateChange((newState, oldState) => {
  console.log(`Processing: ${oldState} → ${newState}`);
});

agentStateMachine.onStateChange((newState, oldState) => {
  console.log(`Agent: ${oldState} → ${newState}`);
});
```

### Common Error Messages

```
Error: Invalid capture state transition: idle -> active
→ Fix: Add setStarting() before setActive()

Error: Invalid playback state transition: buffering -> idle
→ Fix: Add setStopped() before setIdle()

Error: Invalid processing state transition: idle -> streaming
→ Fix: Add setProcessing() before setStreaming()
```

---

## State-Aware Transitions

Always check current state before transitioning to avoid invalid transitions:

### Resuming Capture After TTS

```typescript
const captureState = captureStateMachine.getState();

if (captureState === 'paused') {
  // Normal resume: paused → active
  captureStateMachine.setActive();
} else if (captureState === 'error') {
  // Recovery: error → idle → starting → active
  captureStateMachine.setIdle();
  captureStateMachine.setStarting();
  captureStateMachine.setActive();
} else if (captureState === 'stopped') {
  // Restart: stopped → idle → starting → active
  captureStateMachine.setIdle();
  captureStateMachine.setStarting();
  captureStateMachine.setActive();
}
// else: already in desired state, no change needed
```

### Pausing Capture Before TTS

```typescript
const captureState = captureStateMachine.getState();

if (captureState === 'active') {
  // Normal pause: active → paused
  captureStateMachine.setPaused();
  await stt.disconnect();
} else if (captureState === 'error') {
  // Already in error, can't pause
  logger.warn('Capture in error state, skipping pause');
}
// else: not active, no need to pause
```

## Best Practices

1. **Always follow the transition paths** - don't skip intermediate states
2. **Check state before setting** - check current state to choose the right transition
3. **Use state change listeners** - for debugging and monitoring
4. **Reset properly** - always go through proper shutdown sequence
5. **Handle errors gracefully** - transition to error state, then recover
6. **State-aware operations** - check state before attempting transitions

## See Also

- [Architecture Overview](./Architecture.md) - Complete architecture
- [Final State Machine Architecture](./Final%20State%20Machine%20Architecture.md) - State machine details
- [Testing](./Testing.md) - How to test state transitions
