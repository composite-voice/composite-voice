# Examples

This guide provides an overview of all available examples and how to use them to learn CompositeVoice.

## Overview

All examples are standalone applications that import the **built** CompositeVoice package from `../../dist`. This means:

1. You must build the main package first
2. Each example can be run independently
3. Examples demonstrate real-world usage patterns

## Quick Start

### Step 1: Build the Main Package

From the project root:

```bash
pnpm install
pnpm run build
```

### Step 2: Choose an Example

Navigate to the example directory:

```bash
cd examples/basic-browser
# or
cd examples/vite-typescript
```

### Step 3: Follow the Example's README

Each example has detailed setup instructions in its README.

## Available Examples

### 1. Basic Browser

**Path:** `examples/basic-browser/`  
**Complexity:** ⭐ Beginner  
**Requirements:** Modern browser, no API keys needed

A pure HTML/JavaScript example using native browser APIs:

- Web Speech API for STT
- Speech Synthesis API for TTS
- Mock LLM (no API key required)
- No build step needed

**Best for:**

- Quick testing
- Learning the basics
- Prototyping without API keys
- Browser compatibility testing

**Run it:**

```bash
cd examples/basic-browser
python -m http.server 8000
# Open http://localhost:8000
```

### 2. Vite + TypeScript

**Path:** `examples/vite-typescript/`  
**Complexity:** ⭐⭐ Intermediate  
**Requirements:** Node.js, OpenAI API key (recommended)

A modern development setup with:

- Vite for fast dev experience
- TypeScript for type safety
- Real LLM integration (OpenAI)
- Hot module replacement
- Production-ready build

**Best for:**

- Production applications
- TypeScript projects
- Integration with real AI models
- Modern web development workflow

**Run it:**

```bash
cd examples/vite-typescript
pnpm install
cp .env.example .env
# Edit .env with your API keys
pnpm run dev
```

### 3. Custom Provider (Coming Soon)

**Path:** `examples/custom-provider/`  
**Complexity:** ⭐⭐⭐ Advanced  
**Requirements:** Node.js, understanding of provider architecture

Will demonstrate:

- Creating custom STT provider
- Creating custom LLM provider
- Creating custom TTS provider
- Provider testing
- Integration patterns

### 4. All-in-One (Coming Soon)

**Path:** `examples/all-in-one/`  
**Complexity:** ⭐⭐ Intermediate  
**Requirements:** Node.js, Deepgram API key

Will demonstrate:

- Using Deepgram Aura all-in-one provider
- Lower latency real-time conversations
- Single provider configuration
- WebSocket streaming

## Example Structure

Each example follows this pattern:

```
example-name/
├── README.md           # Setup and usage instructions
├── package.json        # Dependencies (for Node examples)
├── .env.example        # Example environment variables
├── .gitignore          # Ignore .env and build files
├── index.html          # Entry point
└── src/                # Source files (for built examples)
```

## Common Tasks

### Running Without Building

If you just want to see the examples without building:

1. Download a release version
2. Extract to `node_modules/@lukeocodes/composite-voice`
3. Run the example

### Modifying Examples

To modify an example:

1. Make changes to example files
2. If you changed the main package, rebuild it:
   ```bash
   cd ../..
   pnpm run build
   cd examples/your-example
   ```
3. Refresh your browser or restart the dev server

### Adding Your Own Example

To create a new example:

1. Create a new directory in `examples/`
2. Add a `README.md` with setup instructions
3. Reference the package as `file:../../` in `package.json`
4. Import from `@lukeocodes/composite-voice`
5. Document any API keys or setup needed

Example `package.json`:

```json
{
  "name": "my-example",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@lukeocodes/composite-voice": "file:../../"
  }
}
```

## Troubleshooting

### "Cannot find module '@lukeocodes/composite-voice'"

**Solution:** Build the main package:

```bash
cd /path/to/composite-voice
pnpm run build
```

### "Module not found" in example

**Solution:** Install example dependencies:

```bash
cd examples/[example-name]
pnpm install
```

### Browser console errors

**Possible causes:**

- Browser doesn't support required APIs
- Microphone permission denied
- HTTPS required (in production)
- API keys missing or invalid

**Solutions:**

- Use Chrome/Edge for best compatibility
- Grant microphone permissions
- Use HTTPS in production (localhost/file:// work for dev)
- Check `.env` file has valid API keys

### API rate limits

Some examples use real AI services that have rate limits:

- OpenAI: [Rate limits](https://platform.openai.com/account/rate-limits)
- Deepgram: [Usage limits](https://developers.deepgram.com/docs/rate-limits)
- ElevenLabs: [Quota limits](https://elevenlabs.io/docs/api-reference/quota)

Consider implementing:

- Request throttling
- Caching responses
- Usage monitoring
- Backend proxy

## Next Steps

- **[Getting Started](./Getting%20Started.md)** - Learn the basics of CompositeVoice
- **[Architecture](./Architecture.md)** - Understand the system design
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Create custom providers
- **[Testing](./Testing.md)** - Learn about testing strategies

## Contributing Examples

We welcome example contributions! To submit an example:

1. Create a complete, working example
2. Include a comprehensive README
3. Document all requirements and setup steps
4. Test on multiple browsers
5. Submit a pull request

**Example criteria:**

- ✅ Uses built package (not source)
- ✅ Standalone (own dependencies)
- ✅ Well-documented
- ✅ Demonstrates specific use case
- ✅ Includes error handling
- ✅ Works cross-browser (when possible)
