---
name: Bug report
about: Something isn't working as expected
labels: bug
---

## What happened?

<!-- A clear, concise description of the bug. What did you expect to happen vs. what actually happened? -->

## Minimal reproduction

<!-- The smallest possible code snippet or step-by-step instructions that reliably reproduce the bug.
     A runnable snippet is ideal. Remove anything unrelated to the bug. -->

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

// minimal reproduction here
```

**Steps:**
1.
2.
3.

## Expected behaviour

<!-- What should have happened? -->

## Actual behaviour

<!-- What happened instead? Include the full error message, stack trace, and any browser console output. -->

```
paste error / stack trace here
```

## Environment

- **OS:** (e.g. macOS 15, Windows 11, Ubuntu 24.04)
- **Browser:** (e.g. Chrome 122, Edge 121 — if applicable)
- **Node.js version:** (`node -v`)
- **SDK version:** (`@lukeocodes/composite-voice` version from package.json)
- **STT provider:** (e.g. NativeSTT, DeepgramSTT with nova-3)
- **LLM provider:** (e.g. AnthropicLLM with claude-haiku-4-5)
- **TTS provider:** (e.g. NativeTTS, DeepgramTTS with aura-2-thalia-en)

## Additional context

<!-- Screenshots, browser network logs, or anything else that might help narrow it down. -->
