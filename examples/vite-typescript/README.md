# Vite + TypeScript Example

A modern, production-ready example using Vite, TypeScript, and real LLM providers.

## Features

- ⚡ Vite for lightning-fast development
- 🔷 TypeScript for type safety
- 🤖 OpenAI GPT integration
- 🎤 Choice of STT providers (Native, Deepgram, OpenAI Whisper)
- 🔊 Choice of TTS providers (Native, Deepgram, ElevenLabs)
- 🎨 Modern React UI (optional: can use vanilla JS)
- 🔄 Hot module replacement
- 📦 Optimized production builds

## Prerequisites

- Node.js >= 18.0.0
- pnpm (or npm/yarn)
- OpenAI API key (required)
- Optional: Deepgram API key, ElevenLabs API key

## Setup

### 1. Build the Main Package

From the project root:

```bash
cd ../..  # Go to project root
pnpm install
pnpm run build
```

### 2. Install Example Dependencies

```bash
cd examples/vite-typescript
pnpm install
```

### 3. Configure Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required
VITE_OPENAI_API_KEY=sk-...

# Optional (if using Deepgram)
VITE_DEEPGRAM_API_KEY=...

# Optional (if using ElevenLabs)
VITE_ELEVENLABS_API_KEY=...
```

⚠️ **Important**: Never commit `.env` to version control!

### 4. Run Development Server

```bash
pnpm run dev
```

Open http://localhost:5173

## Usage

1. The app will initialize automatically
2. Click the microphone button to start/stop listening
3. Speak your question or message
4. The AI will respond via text and speech
5. Transcripts are displayed in real-time

## Configuration

### Provider Selection

Edit `src/config.ts` to choose providers:

```typescript
export const config = {
  // Choose STT provider
  stt: 'native', // 'native' | 'deepgram' | 'openai'

  // Choose TTS provider
  tts: 'native', // 'native' | 'deepgram' | 'elevenlabs'

  // LLM settings
  llm: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    systemPrompt: 'You are a helpful voice assistant.',
  },
};
```

### Audio Settings

Modify `src/config.ts`:

```typescript
export const audioConfig = {
  input: {
    sampleRate: 16000,
    format: 'pcm',
    channels: 1,
    echoCancellation: true,
    noiseSuppression: true,
  },
  output: {
    bufferSize: 4096,
    minBufferDuration: 200,
  },
};
```

## Project Structure

```
vite-typescript/
├── src/
│   ├── main.ts              # Entry point
│   ├── config.ts            # Configuration
│   ├── agent.ts             # CompositeVoice setup
│   ├── ui.ts                # UI logic
│   └── styles.css           # Styles
├── public/                  # Static assets
├── index.html              # HTML template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite config
├── .env.example            # Example environment variables
└── README.md              # This file
```

## Building for Production

```bash
pnpm run build
```

Output in `dist/` directory. Serve with any static file server:

```bash
pnpm run preview
```

## Deployment

### Deploy to Vercel

```bash
npx vercel
```

### Deploy to Netlify

```bash
npx netlify deploy --prod
```

### Deploy to GitHub Pages

1. Update `vite.config.ts` base URL
2. Build: `pnpm run build`
3. Deploy `dist/` directory

## Environment Variables

| Variable                  | Required | Description                   |
| ------------------------- | -------- | ----------------------------- |
| `VITE_OPENAI_API_KEY`     | Yes      | OpenAI API key for GPT models |
| `VITE_DEEPGRAM_API_KEY`   | No       | Deepgram API key for STT/TTS  |
| `VITE_ELEVENLABS_API_KEY` | No       | ElevenLabs API key for TTS    |

⚠️ **Security Note**:

- Client-side API keys are visible to users
- Consider using a backend proxy for production
- Implement rate limiting and usage monitoring

## Advanced Usage

### Using React

Install React:

```bash
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom
```

Create a React component:

```tsx
import { useEffect, useState } from 'react';
import { createAgent } from './agent';

export function VoiceAgent() {
  const [agent, setAgent] = useState(null);
  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    const voiceAgent = createAgent();
    voiceAgent.on('agent.stateChange', (e) => setState(e.state));
    voiceAgent.on('transcription.final', (e) => setTranscript(e.text));
    voiceAgent.initialize();
    setAgent(voiceAgent);

    return () => voiceAgent.dispose();
  }, []);

  // ... rest of component
}
```

### Adding Conversation History

```typescript
const history: LLMMessage[] = [];

agent.on('transcription.final', (event) => {
  history.push({ role: 'user', content: event.text });
});

agent.on('llm.complete', (event) => {
  history.push({ role: 'assistant', content: event.text });
});

// Use history for context-aware responses
```

### Voice Activity Detection

```typescript
import { calculateRMS, isSilent } from '@lukeocodes/composite-voice';

const capture = agent.getAudioCapture();
capture.start((audioData) => {
  const samples = new Float32Array(audioData);
  const volume = calculateRMS(samples);

  if (isSilent(samples, 0.01)) {
    // Handle silence (auto-stop, etc.)
  }

  // Send to provider...
});
```

## Troubleshooting

### "Cannot find module '@lukeocodes/composite-voice'"

Build the main package:

```bash
cd ../..
pnpm run build
cd examples/vite-typescript
```

### API key errors

- Check `.env` file exists and has correct keys
- Restart dev server after changing `.env`
- Verify API keys are valid

### TypeScript errors

```bash
pnpm run type-check
```

### Build fails

```bash
# Clean and rebuild
rm -rf node_modules dist
pnpm install
pnpm run build
```

## Performance Tips

1. **Debounce audio**: Don't send every audio chunk to STT
2. **Cache responses**: Store common Q&A pairs
3. **Preload models**: Initialize providers eagerly
4. **Use WebSocket**: For lower latency than REST
5. **Optimize bundle**: Use dynamic imports for providers

## Next Steps

- See [custom provider example](../custom-provider/) to create custom integrations
- Check [all-in-one example](../all-in-one/) for simplified setup
- Read the [API documentation](../../docs/API.md) for advanced features
