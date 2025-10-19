# Folder Structure

This document outlines the project structure for CompositeVoice SDK.

```
composite-voice/
├── docs/                           # Documentation
│   ├── Architecture.md             # Architectural decisions and design
│   ├── Examples.md                 # Guide to examples directory
│   ├── Folder Structure.md         # This file
│   ├── Getting Started.md          # Quick start guide
│   ├── Provider Implementation Guide.md # Custom provider creation
│   └── Testing.md                  # Comprehensive testing guide
├── dist/                           # Built output (generated)
│   ├── index.js                    # CommonJS build
│   ├── index.mjs                   # ESM build
│   ├── index.d.ts                  # Type definitions
│   └── ...                         # Provider exports
├── src/
│   ├── core/
│   │   ├── events/
│   │   │   ├── EventEmitter.ts     # Core event emitter implementation
│   │   │   ├── types.ts            # Event type definitions
│   │   │   └── index.ts            # Events module exports
│   │   ├── audio/
│   │   │   ├── AudioCapture.ts     # Microphone audio capture
│   │   │   ├── AudioPlayer.ts      # Audio playback management
│   │   │   └── index.ts            # Audio module exports
│   │   ├── state/
│   │   │   ├── AgentState.ts       # Agent state machine
│   │   │   └── index.ts            # State module exports
│   │   └── types/
│   │       ├── providers.ts        # Provider interface definitions
│   │       ├── audio.ts            # Audio-related types
│   │       ├── config.ts           # Configuration types
│   │       └── index.ts            # Core types exports
│   ├── providers/
│   │   ├── base/
│   │   │   ├── BaseProvider.ts     # Base provider class
│   │   │   ├── BaseSTTProvider.ts  # Base STT provider
│   │   │   ├── BaseLLMProvider.ts  # Base LLM provider
│   │   │   ├── BaseTTSProvider.ts  # Base TTS provider
│   │   │   ├── BaseAllInOneProvider.ts # Base all-in-one provider
│   │   │   └── index.ts            # Base classes exports
│   │   ├── stt/
│   │   │   ├── native/
│   │   │   │   ├── NativeSTT.ts    # Browser Web Speech API
│   │   │   │   └── index.ts
│   │   │   └── index.ts            # STT providers exports
│   │   ├── llm/
│   │   │   └── index.ts            # LLM providers exports (to be implemented)
│   │   ├── tts/
│   │   │   ├── native/
│   │   │   │   ├── NativeTTS.ts    # Browser Speech Synthesis
│   │   │   │   └── index.ts
│   │   │   └── index.ts            # TTS providers exports
│   │   ├── all-in-one/
│   │   │   └── index.ts            # All-in-one providers exports (to be implemented)
│   │   └── index.ts                # All providers exports
│   ├── utils/
│   │   ├── logger.ts               # Logging utilities
│   │   ├── websocket.ts            # WebSocket utilities
│   │   ├── audio.ts                # Audio processing utilities
│   │   ├── errors.ts               # Custom error classes
│   │   └── index.ts                # Utils exports
│   ├── CompositeVoice.ts           # Main SDK class
│   └── index.ts                    # Main entry point
├── tests/
│   ├── unit/
│   │   ├── core/
│   │   │   ├── audio/
│   │   │   │   └── AudioCapture.test.ts
│   │   │   ├── events/
│   │   │   │   ├── EventEmitter.test.ts
│   │   │   │   ├── EventEmitter.snapshot.test.ts
│   │   │   │   └── __snapshots__/
│   │   │   │       └── EventEmitter.snapshot.test.ts.snap
│   │   │   └── state/
│   │   │       └── AgentState.test.ts
│   │   ├── providers/
│   │   │   └── base/
│   │   │       └── BaseProvider.test.ts
│   │   └── utils/
│   │       ├── audio.test.ts
│   │       ├── errors.test.ts
│   │       ├── logger.test.ts
│   │       └── websocket.test.ts
│   ├── integration/
│   │   └── composite-mode.test.ts
│   ├── mocks/
│   │   └── MockProviders.ts        # Mock providers for testing
│   ├── __snapshots__/              # Jest snapshot files
│   ├── setup.ts                    # Jest setup configuration
│   └── README.md                   # Testing documentation
├── examples/                       # Example implementations
│   ├── basic-browser/              # Pure HTML/JS example
│   │   ├── index.html
│   │   └── README.md
│   ├── vite-typescript/            # Modern TypeScript example
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── main.ts
│   │   │   └── styles.css
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── README.md
│   └── README.md                   # Examples overview
├── prompt-log/                     # Development conversation logs
│   └── *.md
├── node_modules/                   # Dependencies (not committed)
├── .gitignore
├── .eslintrc.js                    # ESLint configuration
├── .prettierrc.js                  # Prettier configuration
├── .prettierignore                 # Prettier ignore patterns
├── package.json                    # Package metadata and scripts
├── pnpm-lock.yaml                  # Lockfile
├── tsconfig.json                   # TypeScript configuration
├── jest.config.js                  # Jest configuration
├── README.md                       # Project README
└── LICENSE                         # MIT license
```

## Key Directories

### `/src/core`

Contains the foundational building blocks of the SDK:

- Event system for normalizing provider communications
- Audio capture and playback utilities
- Agent state management
- Core type definitions

### `/src/providers`

Provider implementations organized by type:

- Base classes that all providers extend
- Individual provider implementations grouped by type (STT, LLM, TTS, all-in-one)
- Each provider has its own directory with types and implementation

### `/src/utils`

Shared utilities used across the SDK:

- Logging
- WebSocket management
- Audio processing helpers
- Custom error classes

### `/tests`

Comprehensive test suite:

- Unit tests for individual components
- Integration tests for provider combinations
- Mock implementations for testing

### `/examples`

Practical examples showing how to use the SDK:

- **basic-browser/** - Pure HTML/JS implementation using native browser APIs
- **vite-typescript/** - Modern TypeScript setup with Vite
- Each example is standalone and imports from the built `dist/` directory
- See [Examples.md](./Examples.md) for detailed guides

### `/docs`

Comprehensive documentation:

- **Architecture.md** - System design and architectural decisions
- **Getting Started.md** - Quick start guide and basic usage
- **Provider Implementation Guide.md** - Creating custom providers
- **Testing.md** - Testing strategy and guidelines
- **Examples.md** - Guide to example applications
- **Folder Structure.md** - This file

## File Naming Conventions

- **PascalCase** for class files (e.g., `EventEmitter.ts`, `AudioCapture.ts`)
- **camelCase** for utility and type files (e.g., `types.ts`, `logger.ts`)
- **Sentence case with spaces** for documentation files (e.g., `Getting Started.md`)
- Each directory contains an `index.ts` that exports its public API
- Test files mirror source structure with `.test.ts` extension
- Snapshot test files end with `.snapshot.test.ts`

## Build Output

The `dist/` directory contains the compiled package:

- **CommonJS** (`*.js`) - For Node.js and bundlers
- **ESM** (`*.mjs`) - For modern JavaScript modules
- **Type Definitions** (`*.d.ts`, `*.d.mts`) - TypeScript declarations
- Multiple entry points for tree-shaking (providers can be imported separately)

## Related Documentation

- **[Architecture](./Architecture.md)** - Understand the system design and module structure
- **[Getting Started](./Getting%20Started.md)** - Learn how to use the SDK
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Create custom providers
- **[Testing](./Testing.md)** - Learn about the test structure
- **[Examples](./Examples.md)** - See the examples directory structure
