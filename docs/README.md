# CompositeVoice Documentation

Welcome to the CompositeVoice documentation! This directory contains comprehensive guides and reference materials for building AI voice agents with CompositeVoice.

## Documentation Overview

### 🚀 [Getting Started](./Getting%20Started.md)

**Start here if you're new to CompositeVoice!**

Learn how to:

- Install and set up CompositeVoice
- Create your first voice agent in 5 minutes
- Understand the two operational modes (Composite vs All-in-One)
- Handle events and manage agent states
- Configure audio settings
- Implement common patterns (push-to-talk, VAD, conversation history)
- Handle errors gracefully

**Best for:** Developers building their first voice agent

---

### 🏗️ [Architecture](./Architecture.md)

**Deep dive into system design and architectural decisions.**

Covers:

- Design principles (lightweight, extensible, type-safe)
- Provider types (STT, LLM, TTS, All-in-One)
- Communication patterns (REST, WebSocket)
- Event system design
- Audio handling (input/output)
- Provider interface design
- Module structure
- Built-in and planned providers

**Best for:** Understanding how CompositeVoice works internally, making architectural decisions

---

### 🔌 [Provider Implementation Guide](./Provider%20Implementation%20Guide.md)

**Learn how to create custom providers.**

Includes:

- Creating custom STT providers (REST and WebSocket)
- Creating custom LLM providers (streaming)
- Creating custom TTS providers (REST and WebSocket)
- Best practices for provider development
- Testing your providers
- Publishing providers as packages

**Best for:** Developers who need to integrate with custom or unsupported AI services

---

### 🧪 [Testing](./Testing.md)

**Comprehensive testing guide and strategy.**

Explains:

- Testing philosophy (what to test, what not to test)
- Test coverage and statistics
- Writing unit, integration, and snapshot tests
- Mocking browser APIs
- Key testing decisions (WebSocket, Audio, Provider testing)
- Running and debugging tests
- Coverage goals and CI integration

**Best for:** Contributors, developers ensuring code quality

---

### 💡 [Examples](./Examples.md)

**Guide to example applications.**

Features:

- Overview of all examples
- Setup instructions for each example
- Complexity ratings
- Troubleshooting common issues
- Contributing your own examples

Available examples:

- **Basic Browser** - Pure HTML/JS with native APIs
- **Vite + TypeScript** - Modern setup with real providers
- More coming soon!

**Best for:** Learning by example, seeing real-world implementations

---

### 📁 [Folder Structure](./Folder%20Structure.md)

**Project organization and file naming conventions.**

Documents:

- Complete project structure
- Directory purposes and contents
- File naming conventions
- Build output structure
- Test organization

**Best for:** Understanding the codebase layout, contributing to the project

---

### 🤖 [OpenAI LLM Provider](./OpenAI%20LLM%20Provider.md)

**Complete guide to using OpenAI's GPT models with CompositeVoice.**

Covers:

- Installation and setup
- Configuration options
- Basic and advanced usage
- Available models (GPT-4, GPT-3.5)
- Integration patterns
- Best practices and troubleshooting

**Best for:** Developers integrating OpenAI's language models into their voice agents

---

### 🎤 [Deepgram STT Provider](./Deepgram%20STT%20Provider.md)

**Complete guide to using Deepgram's speech-to-text API with CompositeVoice.**

Covers:

- Installation and setup
- Real-time WebSocket streaming
- Configuration options
- Advanced features (diarization, VAD, endpointing)
- Supported languages and models
- Audio format requirements
- Best practices and troubleshooting

**Best for:** Developers implementing real-time speech recognition with industry-leading accuracy and low latency

---

### 🔊 [Deepgram TTS Provider](./Deepgram%20TTS%20Provider.md)

**Complete guide to using Deepgram's text-to-speech API with CompositeVoice.**

Covers:

- Installation and setup
- Real-time WebSocket streaming synthesis
- Configuration options
- Available voice models (12+ voices)
- Audio quality and latency optimization
- Integration patterns
- Best practices and troubleshooting

**Best for:** Developers implementing real-time text-to-speech with natural-sounding voices and low latency

---

## Quick Links

### Common Tasks

- **Install CompositeVoice** → [Getting Started - Installation](./Getting%20Started.md#installation)
- **Create a voice agent** → [Getting Started - Quick Start](./Getting%20Started.md#quick-start)
- **Understand events** → [Getting Started - Event System](./Getting%20Started.md#event-system)
- **Configure audio** → [Getting Started - Configuration Options](./Getting%20Started.md#configuration-options)
- **Build a custom provider** → [Provider Implementation Guide](./Provider%20Implementation%20Guide.md)
- **Run tests** → [Testing - Running Tests](./Testing.md#running-tests)
- **View examples** → [Examples](./Examples.md)

### Key Concepts

- **Composite vs All-in-One Mode** → [Architecture - Provider Types](./Architecture.md#provider-types)
- **Event System** → [Architecture - Event System](./Architecture.md#event-system)
- **Audio Handling** → [Architecture - Audio Handling](./Architecture.md#audio-handling)
- **Provider Interfaces** → [Architecture - Provider Interface Design](./Architecture.md#provider-interface-design)

### Reference

- **Project Structure** → [Folder Structure](./Folder%20Structure.md)
- **Testing Strategy** → [Testing](./Testing.md)
- **Built-in Providers** → [Architecture - Built-in Providers](./Architecture.md#built-in-providers)

## Documentation Standards

All documentation in this directory follows these standards:

### File Naming

- Use **sentence case with spaces** (e.g., `Getting Started.md`)
- Be descriptive and clear
- Avoid abbreviations unless commonly understood

### Formatting

- Use Markdown for all documentation
- Include a table of contents for long documents
- Use code blocks with language tags (` ```typescript `)
- Use relative links for cross-references
- Add emoji icons for visual navigation (sparingly)

### Content Structure

1. **Title** - Clear, descriptive H1 heading
2. **Introduction** - Brief overview of the document
3. **Table of Contents** - For documents > 100 lines
4. **Main Content** - Well-organized with H2/H3 headings
5. **Cross-references** - Links to related documentation
6. **Examples** - Code samples where applicable

### Cross-References

When linking between docs:

- Use relative paths: `[Architecture](./Architecture.md)`
- Include descriptive link text
- Link to specific sections when helpful: `[Event System](./Architecture.md#event-system)`

## Contributing to Documentation

We welcome documentation improvements! When contributing:

1. **Before editing:**
   - Read existing documentation to understand the style
   - Check for existing related content
   - Ensure accuracy against the codebase

2. **While writing:**
   - Follow the documentation standards above
   - Use clear, concise language
   - Include code examples
   - Test all code samples
   - Add cross-references to related docs

3. **After editing:**
   - Check spelling and grammar
   - Verify all links work
   - Update cross-references in other docs if needed
   - Run `pnpm run format` to format markdown

4. **Submit:**
   - Create a pull request
   - Describe what documentation changed and why
   - Link to related issues if applicable

## Need Help?

- 🐛 [Report Issues](https://github.com/lukeocodes/composite-voice/issues)
- 💬 [Join Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- 📖 [View Source](https://github.com/lukeocodes/composite-voice)
- 📚 [Main README](../README.md)

---

**Happy coding!** 🎉
