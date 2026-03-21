---
title: Smart Text Routing
description: How CompositeVoice splits LLM output into visual and spoken streams, handles code fences, and strips markdown for TTS.
order: 9
---

### The problem

LLM responses often contain markdown formatting, code blocks, and structured text that sounds terrible when read aloud:

> "Here's an example colon opening backtick backtick backtick typescript function hello open paren close paren open brace console dot log open paren quote hello quote close paren..."

CompositeVoice solves this with automatic **text routing** — LLM output is split into separate visual and spoken streams before reaching the TTS provider.

### How it works

The pipeline inserts three components between the LLM and TTS stages:

```
LLM tokens → ChunkSplitter → LLMTextRouter → TTS
                                    ↓
                              Visual stream → UI
```

1. **ChunkSplitter** detects code fence boundaries (`` ``` ``) across streaming chunks. Fenced content is buffered entirely — partial fences never leak to downstream consumers.

2. **LLMTextRouter** routes each chunk to the appropriate stream:
   - **Visual stream** (`llm.chunk` event) — receives the full LLM output including markdown and code blocks, for rendering in the UI.
   - **Spoken stream** — receives only prose text with markdown stripped, sent to the TTS provider.

3. **ttsStrip** processes the spoken stream, removing markdown syntax (headings, bold, italic, links, lists, inline code) while preserving natural sentence structure.

### What gets routed where

| Content | Visual stream (UI) | Spoken stream (TTS) |
|---------|-------------------|-------------------|
| Plain text | Yes | Yes |
| **Bold**, *italic* | Yes (with syntax) | Yes (syntax stripped) |
| `inline code` | Yes | Yes (backticks removed) |
| Code fences | Yes (complete block) | No — skipped entirely |
| Headings (`# ...`) | Yes | Yes (syntax stripped) |
| Links `[text](url)` | Yes | Yes (just the link text) |
| Lists (`- item`) | Yes | Yes (bullets removed) |

### Code fence buffering

Code fences are the trickiest case. Because LLM tokens stream character-by-character, a code fence might be split across multiple chunks:

```
Chunk 1: "Here's an example:\n``"
Chunk 2: "`typescript\nfunction hello() {\n"
Chunk 3: "  console.log('hi');\n}\n```"
```

The `ChunkSplitter` detects the opening `` ``` `` and buffers all content until the closing fence arrives. Neither the visual nor spoken stream sees partial fence content. Once the fence closes:

- The **visual stream** receives the complete code block as one chunk.
- The **spoken stream** skips it entirely.

### Events

```typescript
// Visual stream — full markdown and code for UI rendering
voice.on('llm.chunk', ({ chunk }) => {
  appendToUI(chunk); // includes code blocks, markdown, etc.
});

// The spoken stream is handled automatically by the pipeline.
// TTS receives clean, natural-sounding text with no configuration needed.
```

### No configuration needed

Smart text routing is built into the pipeline and enabled by default. There's nothing to configure — it works automatically with all LLM and TTS provider combinations.

If you're building a custom LLM provider, extend `BaseLLMProvider` and the routing is applied to your output automatically by the `CompositeVoice` orchestrator.
