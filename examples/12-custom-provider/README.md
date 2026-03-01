# Example 12 — Custom Provider

Proves SDK extensibility by implementing a custom LLM provider from scratch. The `MockLLM` extends `BaseLLMProvider` and runs entirely in the browser — zero API keys needed.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `MockLLM` (custom) | In-browser mock responses | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to extend `BaseLLMProvider` to create a custom provider
- The minimal interface a custom LLM provider must implement
- How `generate()` and `generateFromMessages()` work with async iterables
- How to simulate streaming responses with `AsyncGenerator`
- That the SDK works with any text source — not just cloud APIs

---

## No API Keys Required

This is the only example that needs zero configuration. Just:

```bash
pnpm install && pnpm build
pnpm example:12-custom-provider:dev
```

Open [http://localhost:3012](http://localhost:3012) in Chrome or Edge.

---

## The custom provider pattern

```javascript
import {
  CompositeVoice,
  NativeSTT,
  NativeTTS,
  BaseLLMProvider,
} from '@lukeocodes/composite-voice';

// Custom LLM — extend BaseLLMProvider (inherits roles: ['llm'])
class MockLLM extends BaseLLMProvider {
  async onInitialize() { /* connect to your backend */ }
  async onDispose() { /* clean up */ }

  async generate(prompt, options) {
    return this.generateFromMessages([{ role: 'user', content: prompt }], options);
  }

  async generateFromMessages(messages, options) {
    this.assertReady();
    return {
      async *[Symbol.asyncIterator]() {
        yield 'Hello ';
        yield 'from ';
        yield 'your custom provider!';
      },
    };
  }
}

// Use with the providers array — NativeSTT and NativeTTS are multi-role
const agent = new CompositeVoice({
  providers: [
    new NativeSTT(),   // [input + stt]
    new MockLLM(),     // [llm]
    new NativeTTS(),   // [tts + output]
  ],
});
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [00 — Minimal Voice Agent](../00-minimal-voice-agent/) | Real Anthropic LLM |
| [40 — OpenAI Pipeline](../40-openai-pipeline/) | Real OpenAI LLM |
| [10 — Proxy Server](../10-proxy-server/) | Production deployment |
