# Basic Browser Example

A simple HTML/JavaScript example demonstrating CompositeVoice with native browser APIs and OpenAI.

## Features

- 🎤 Native browser Speech Recognition (STT)
- 🔊 Native browser Speech Synthesis (TTS)
- 🤖 OpenAI LLM (GPT-4o-mini)
- 📱 Responsive UI
- 🎨 Visual state indicators
- 📝 Real-time transcription display

## Prerequisites

- Modern browser (Chrome, Edge, or Safari recommended)
- Built CompositeVoice package (see below)
- OpenAI API key (get one at https://platform.openai.com/api-keys)

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
2. When prompted, enter your OpenAI API key
3. Click **"Start Listening"** to begin capturing audio
4. Speak into your microphone
5. Watch the transcription appear in real-time
6. OpenAI will generate a response, and you'll hear the TTS output
7. Click **"Stop Listening"** when done
8. Click **"Dispose"** to clean up resources

## Browser Support

| Feature            | Chrome | Firefox    | Safari     | Edge |
| ------------------ | ------ | ---------- | ---------- | ---- |
| Speech Recognition | ✅     | ⚠️ Limited | ⚠️ Limited | ✅   |
| Speech Synthesis   | ✅     | ✅         | ✅         | ✅   |
| Web Audio API      | ✅     | ✅         | ✅         | ✅   |

⚠️ **Note**: Speech Recognition API has limited support in Firefox and Safari. Chrome/Edge recommended for best experience.

## Architecture

This example demonstrates the **composite mode** with clear responsibility boundaries:

```
Providers own I/O:
  microphone → Native STT        Native TTS → speakers

SDK coordinates data flow:
               STT → OpenAI LLM → TTS
```

### Responsibilities

- **Native STT Provider**: Manages microphone access via browser's `SpeechRecognition` API
- **OpenAI LLM Provider**: Processes text and generates responses
- **Native TTS Provider**: Manages speaker output via browser's `SpeechSynthesis` API
- **CompositeVoice SDK**: Connects the providers, manages state, and coordinates data flow

### OpenAI LLM

The example uses OpenAI's GPT-4o-mini model with:

- Brief, conversational responses
- Streaming text generation
- 150 token limit for quick responses

The OpenAI SDK is loaded from a CDN (jsDelivr) using an import map, avoiding the need for a build step in this simple browser example.

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

## Security Note

⚠️ **Important**: This example prompts for your OpenAI API key in the browser. This is fine for local development and testing, but **never expose your API key in production**. For production applications:

- Use a backend server to proxy API requests
- Implement proper authentication and rate limiting
- Never commit API keys to source control

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

### OpenAI API errors

- **Invalid API key**: Double-check your API key at https://platform.openai.com/api-keys
- **Rate limit errors**: You may need to add credits to your OpenAI account
- **CORS errors**: Make sure you're serving the file from a local server (not file://)
- **Model not found**: Ensure you have access to the gpt-4o-mini model (or change to gpt-3.5-turbo)

## Next Steps

- Check out the [Vite TypeScript example](../vite-typescript/) for a production-ready setup
- See the [custom provider example](../custom-provider/) to create your own providers
- Try the [all-in-one example](../all-in-one/) for lower latency with Deepgram Aura
