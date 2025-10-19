# Basic Browser Example

A simple HTML/JavaScript example demonstrating CompositeVoice with native browser APIs and a mock LLM.

## Features

- 🎤 Native browser Speech Recognition (STT)
- 🔊 Native browser Speech Synthesis (TTS)
- 🤖 Mock LLM (no API key required)
- 📱 Responsive UI
- 🎨 Visual state indicators
- 📝 Real-time transcription display

## Prerequisites

- Modern browser (Chrome, Edge, or Safari recommended)
- Built CompositeVoice package (see below)

## Setup

### 1. Build the Main Package

From the project root:

```bash
pnpm install
pnpm run build
```

### 2. Serve the Example

You can use any static file server. Here are a few options:

**Option A: Using Python**

```bash
python -m http.server 8000
```

**Option B: Using Node's http-server**

```bash
npx http-server -p 8000
```

**Option C: Using VS Code Live Server**

- Install the Live Server extension
- Right-click on `index.html` and select "Open with Live Server"

### 3. Open in Browser

Navigate to:

```
http://localhost:8000/examples/basic-browser/index.html
```

## Usage

1. Click **"Initialize"** to set up the voice agent
2. Click **"Start Listening"** to begin capturing audio
3. Speak into your microphone
4. Watch the transcription appear in real-time
5. The mock LLM will respond, and you'll hear the TTS output
6. Click **"Stop Listening"** when done
7. Click **"Dispose"** to clean up resources

## Browser Support

| Feature            | Chrome | Firefox    | Safari     | Edge |
| ------------------ | ------ | ---------- | ---------- | ---- |
| Speech Recognition | ✅     | ⚠️ Limited | ⚠️ Limited | ✅   |
| Speech Synthesis   | ✅     | ✅         | ✅         | ✅   |
| Web Audio API      | ✅     | ✅         | ✅         | ✅   |

⚠️ **Note**: Speech Recognition API has limited support in Firefox and Safari. Chrome/Edge recommended for best experience.

## Architecture

This example demonstrates the **composite mode** with:

```
User Speech → Native STT → Mock LLM → Native TTS → Audio Output
```

### Mock LLM

The example includes a mock LLM that:

- Echoes back what you said
- Simulates streaming by sending words one at a time
- Demonstrates the text chunking pattern

For a real implementation, replace the mock LLM with:

```javascript
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';

llm: new OpenAILLM({
  apiKey: 'your-api-key',
  model: 'gpt-4',
});
```

## Customization

### Change Voice

Modify the TTS configuration:

```javascript
tts: new NativeTTS({
  voice: 'Google UK English Female', // Change to any available voice
  rate: 1.2, // Speed (0.1 to 10)
  pitch: 0, // Pitch adjustment
});
```

List available voices in the browser console:

```javascript
speechSynthesis.getVoices().forEach((voice) => {
  console.log(voice.name, voice.lang);
});
```

### Change Language

Modify the STT configuration:

```javascript
stt: new NativeSTT({
  language: 'es-ES', // Spanish
  interimResults: true,
  continuous: true,
});
```

## Troubleshooting

### "Web Speech API is not supported in this browser"

- Use Chrome or Edge for best compatibility
- Ensure you're using a recent browser version
- Try enabling experimental features in `chrome://flags`

### No microphone access

- Grant microphone permissions when prompted
- Check browser settings: `chrome://settings/content/microphone`
- HTTPS is required in production (file:// and localhost work for development)

### Voice not working

- Check system volume
- Ensure speakers/headphones are connected
- Try a different voice (see customization above)
- Some voices may not be available on all systems

### Module not found errors

Make sure you've built the main package:

```bash
cd ../..
pnpm run build
```

## Next Steps

- Check out the [Vite TypeScript example](../vite-typescript/) for a production-ready setup
- See the [custom provider example](../custom-provider/) to create your own providers
- Try the [all-in-one example](../all-in-one/) for lower latency with Deepgram Aura
