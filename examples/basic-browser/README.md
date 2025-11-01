# Basic Browser Example

A simple browser-based example demonstrating CompositeVoice SDK with native browser APIs and OpenAI.

## Features

- **Native Speech Recognition**: Uses the Web Speech API for speech-to-text
- **OpenAI GPT**: Natural language processing with GPT-4o-mini
- **Native Speech Synthesis**: Uses the Web Speech Synthesis API for text-to-speech
- **Visual State Management**: See the agent's state transitions in real-time
- **Modern UI**: Beautiful gradient design with responsive controls

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm (or npm/yarn)
- OpenAI API key
- Modern browser with Web Speech API support (Chrome, Edge, Safari)

### Setup

1. **Create a `.env` file** in the `examples/basic-browser` directory:

```bash
cd examples/basic-browser
cp .env.example .env  # Or create manually
```

2. **Add your OpenAI API key** to the `.env` file:

```env
VITE_OPENAI_API_KEY=sk-your-api-key-here
```

> **Note**: The `VITE_` prefix is required for Vite to expose the variable to the client.

### Running the Example

From the **workspace root**:

```bash
# Install dependencies (first time only)
pnpm install

# Start the development server
pnpm example:basic-browser:dev
```

Or using Nx directly:

```bash
nx run example-basic-browser:dev
```

The example will automatically:
1. Build the SDK if needed
2. Start a Vite dev server
3. Open the example in your browser

### Building for Production

```bash
# From workspace root
pnpm example:basic-browser:build

# Preview the production build
pnpm example:basic-browser:preview
```

## How It Works

### Nx Integration

This example is an **Nx application** within the monorepo:

- **Automatic dependency resolution**: The SDK is built before the example starts
- **Fast rebuilds**: Nx caches build outputs for faster development
- **Workspace dependency**: Uses `workspace:*` to link to the local SDK

### Architecture

```
User speaks → Native STT → OpenAI GPT → Native TTS → User hears
```

The example demonstrates:
1. **Initialization**: Setting up the CompositeVoice agent with providers
2. **Event handling**: Listening to agent state changes and transcriptions
3. **User interaction**: Starting/stopping listening sessions
4. **State visualization**: Real-time display of agent states

## Usage

1. **Click "Initialize"**: Set up the CompositeVoice agent
2. **Click "Start Listening"**: Begin speaking
3. **Speak naturally**: The agent will transcribe your speech
4. **Watch the response**: AI generates a response and speaks it back
5. **Click "Stop Listening"**: End the session
6. **Click "Dispose"**: Clean up resources

## Browser Compatibility

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| Speech Recognition | ✅ | ✅ | ✅* | ⚠️ |
| Speech Synthesis | ✅ | ✅ | ✅ | ✅ |
| MediaDevices API | ✅ | ✅ | ✅ | ✅ |

*Safari support may vary by version  
⚠️ Firefox has limited Speech Recognition support

### Required Browser Features

- Web Speech API (Speech Recognition)
- Web Speech API (Speech Synthesis)
- Media Devices API (getUserMedia)
- ES Modules support
- Promise support

## Configuration

The example uses these default settings:

```javascript
// STT Configuration
language: 'en-US'
interimResults: true

// LLM Configuration
model: 'gpt-4o-mini'
temperature: 0.7
maxTokens: 150

// TTS Configuration
rate: 1.0
```

You can modify these in `index.html` to experiment with different settings.

## API Key Security

⚠️ **Important**: This example uses environment variables for the API key. For production applications:

- Never expose API keys in client-side code
- Use a backend proxy to handle API requests
- Implement proper authentication and rate limiting
- Store API keys in environment variables on the server
- The `.env` file is already in `.gitignore` to prevent accidental commits

## Development

### Project Structure

```
examples/basic-browser/
├── .env               # Environment variables (create from .env.example)
├── .env.example       # Example environment configuration
├── .gitignore         # Ignore .env and node_modules
├── index.html         # Main application
├── package.json       # npm dependencies and metadata
├── project.json       # Nx project configuration
├── vite.config.js     # Vite configuration
└── README.md          # This file
```

### Local Development

The example uses **Vite** for development:

- **Hot Module Replacement**: Changes reflect instantly
- **Fast builds**: Optimized for quick iteration
- **ES Modules**: Native browser module support

### Making Changes

When you modify the SDK:

```bash
# Nx automatically rebuilds the SDK when you run the example
pnpm example:basic-browser:dev
```

Or manually rebuild the SDK:

```bash
pnpm build
```

## Troubleshooting

### "Cannot access microphone"

- Grant microphone permissions in your browser
- Use HTTPS in production (required for microphone access)
- Check browser compatibility

### "OpenAI API key is not configured"

- Ensure you have a `.env` file in `examples/basic-browser/`
- Add `VITE_OPENAI_API_KEY=sk-your-key` to the `.env` file
- Restart the dev server after adding the key
- Verify the key has access to the GPT-4o-mini model
- Check your OpenAI account has available credits

### "Speech Recognition not supported"

- Use a compatible browser (Chrome or Edge recommended)
- Update your browser to the latest version
- Try a different browser

### SDK not found errors

```bash
# Rebuild the SDK
pnpm build

# Or let Nx handle it
nx run example-basic-browser:dev
```

### Vite errors

```bash
# Clear Nx cache
nx reset

# Reinstall dependencies
pnpm install
```

## Learning Resources

- [CompositeVoice Documentation](../../docs/)
- [Nx Monorepo Setup](../../docs/Nx%20Monorepo%20Setup.md)
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Vite Documentation](https://vitejs.dev)

## Next Steps

After trying this example:

1. Explore other examples in the `examples/` directory
2. Try different LLM providers (see SDK documentation)
3. Implement custom providers
4. Build your own voice application

## License

This example is part of the CompositeVoice project and uses the same MIT license.
