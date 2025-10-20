# Documentation

Complete documentation for the CompositeVoice SDK.

## 🏗️ Core Architecture

Start here to understand how CompositeVoice works:

- **[Architecture Overview](./Architecture.md)** - Complete architecture guide with responsibility boundaries
- **[State Machines](./Final%20State%20Machine%20Architecture.md)** - State machine details and orchestration
- **[State Transitions](./State%20Transitions.md)** - Valid state transitions and common patterns
- **[Architecture Review](./Architecture%20Review%20Complete.md)** - Recent architectural changes and improvements

## 🚀 Getting Started

- **[Getting Started](./Getting%20Started.md)** - Quick start guide and basic concepts
- **[Examples](./Examples.md)** - Example projects and use cases
- **[Folder Structure](./Folder%20Structure.md)** - Project layout and organization
- **[Testing](./Testing.md)** - Testing guide and best practices

## 🔌 Provider Guides

Learn how to use and create providers:

- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Build custom providers
- **[Deepgram STT Provider](./Deepgram%20STT%20Provider.md)** - Speech-to-text with Deepgram
- **[Deepgram TTS Provider](./Deepgram%20TTS%20Provider.md)** - Text-to-speech with Deepgram
- **[OpenAI LLM Provider](./OpenAI%20LLM%20Provider.md)** - Language model with OpenAI

## 📁 Quick Links

- [Main README](../README.md) - Project overview
- [CHANGELOG](../CHANGELOG.md) - Recent changes
- [Examples Directory](../examples/) - Working code examples

## 🎯 Key Concepts

### Responsibility Boundaries

```
Providers own I/O:
  microphone → STT/ASR        TTS/Synth → speakers

SDK coordinates data flow:
               STT → LLM → TTS
```

### Architecture Principles

1. **Providers Own I/O**: STT manages microphone, TTS manages speakers
2. **SDK Coordinates**: CompositeVoice connects providers via events
3. **Event-Driven**: Everything happens through events
4. **Observable**: All state changes are visible
5. **Modular**: Clear boundaries between components

## 📝 Documentation Philosophy

This documentation follows a "show, don't tell" approach:

- **Architecture docs** explain the "why" and "how"
- **Provider guides** show practical implementation
- **Examples** demonstrate real-world usage
- **Tests** serve as living documentation

## 🤝 Contributing

When updating documentation:

1. Keep docs focused and single-purpose
2. Update examples when changing APIs
3. Document architectural decisions in `Architecture.md`
4. Keep `CHANGELOG.md` up to date

---

**Note**: This documentation is actively maintained. If you find outdated information, please open an issue or PR.
