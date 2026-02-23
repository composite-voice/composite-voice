---
name: Bug report
about: Something isn't working as expected
labels: bug
---

## What happened?

<!-- Tell us what you expected to see and what you actually got.
     Be as specific as you can — "it doesn't work" is hard to diagnose.
     Describe the observable symptom: what event fired (or didn't), what error appeared,
     what state the agent ended up in. If you have a theory about the cause, include it,
     but also include the symptom separately.

     Example:
     Expected: After calling startCapture(), the agent transitions to the "listening" state
               and begins emitting transcription.interim events as I speak.
     Actual:   The agent transitions to "listening" but never emits any transcription events.
               No errors in the console. Speaking loudly makes no difference. -->

**Expected:**

**Actual:**

---

## Steps to reproduce

<!-- The smallest sequence of steps that reliably triggers the bug, starting from a clean state.
     Cut anything that isn't strictly necessary to reproduce it.
     If it's intermittent, note roughly how often it occurs and under what conditions. -->

1.
2.
3.

---

## Minimal reproduction

<!-- The smallest possible code snippet that demonstrates the problem.
     Strip out all business logic, UI code, and anything unrelated to the bug.
     Ideally this snippet runs in isolation (just the SDK + this code) and triggers the bug.
     If you can reproduce it in one of the existing examples, mention which one. -->

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

// paste your minimal reproduction here
```

---

## Error output

<!-- The full error message, stack trace, and any relevant browser console output.
     Please include the complete trace — the first line rarely tells the full story.
     Also include any relevant network errors from the DevTools Network tab (WebSocket frames,
     failed requests) if the issue involves provider communication. -->

```
paste error output here
```

---

## Environment

- **OS:** (e.g. macOS 15.2, Windows 11, Ubuntu 24.04)
- **Browser + version:** (e.g. Chrome 122.0.6261.94, Firefox 124.0 — include the full version; behaviour differs)
- **Node.js version:** (run `node -v` — relevant if using the proxy server)
- **`@lukeocodes/composite-voice` version:** (from your `package.json`)
- **STT provider:** (e.g. `NativeSTT`, `DeepgramSTT` with model `nova-3`)
- **LLM provider:** (e.g. `AnthropicLLM` with `claude-haiku-4-5-20251001`)
- **TTS provider:** (e.g. `NativeTTS`, `DeepgramTTS` with `aura-2-thalia-en`)
- **Using proxy?** (yes / no — if yes, which example or custom setup?)

---

## Additional context

<!-- Anything else that might help narrow down the problem:
     - Screenshots or screen recordings of unexpected behaviour
     - Network logs (HAR files) or WebSocket frame captures from DevTools
     - Whether the bug is specific to a device (iOS, certain Bluetooth headset, etc.)
     - Whether it worked in a previous version
     - Things you've already tried -->
