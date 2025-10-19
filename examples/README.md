# CompositeVoice Examples

This directory contains example applications demonstrating how to use the CompositeVoice SDK.

## Examples

### 1. Basic Browser Example (`basic-browser/`)

A simple HTML/JavaScript example using native browser APIs (Web Speech API) with a mock LLM. Perfect for getting started quickly without any API keys.

**Features:**

- Native browser STT (Speech Recognition API)
- Native browser TTS (Speech Synthesis API)
- Mock LLM for demonstration
- No build step required

### 2. Vite + TypeScript Example (`vite-typescript/`)

A modern Vite-based application with TypeScript, demonstrating integration with real LLM providers.

**Features:**

- Vite for fast development
- TypeScript for type safety
- OpenAI integration
- Hot module replacement

### 3. Custom Provider Example (`custom-provider/`)

Shows how to create and integrate custom STT, LLM, and TTS providers.

**Features:**

- Custom provider implementation
- Provider registration
- Testing custom providers

### 4. All-in-One Example (`all-in-one/`)

Demonstrates using an all-in-one provider (Deepgram Aura) for the complete voice pipeline.

**Features:**

- Single provider setup
- Lower latency
- Real-time conversation

## Running Examples

Each example is a standalone application. Navigate to the example directory and follow its README.

### General Steps:

1. **Build the main package** (from project root):

   ```bash
   pnpm install
   pnpm run build
   ```

2. **Navigate to an example**:

   ```bash
   cd examples/basic-browser
   ```

3. **Follow the example's README** for specific setup instructions

## Requirements

- Node.js >= 18.0.0
- pnpm (or npm/yarn)
- Modern browser with Web Audio API support

## Notes

- Examples use the **built** version of CompositeVoice from `../../dist`
- You must build the main package before running examples
- Some examples require API keys (see individual READMEs)
- For local development, rebuild the main package when making changes

## Troubleshooting

### "Cannot find module '@lukeocodes/composite-voice'"

Make sure you've built the main package:

```bash
cd ../..  # Go to project root
pnpm run build
```

### "Module not found" errors in examples

Each example needs its dependencies installed:

```bash
cd examples/[example-name]
pnpm install
```

### Browser console errors

- Check that your browser supports the required APIs
- For Chrome, you may need to enable experimental features
- HTTPS is required for microphone access in production
