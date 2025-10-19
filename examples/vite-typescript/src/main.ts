import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="container">
    <h1>🎙️ CompositeVoice Example</h1>
    <p class="subtitle">Vite + TypeScript + OpenAI</p>
    
    <div class="status" id="status">
      <span class="status-indicator" id="indicator"></span>
      <span id="status-text">Initializing...</span>
    </div>
    
    <div class="controls">
      <button id="listen-btn" class="btn btn-primary" disabled>
        <span id="listen-icon">🎤</span>
        <span id="listen-text">Start Listening</span>
      </button>
    </div>
    
    <div class="panel">
      <h3>📝 Transcript</h3>
      <div id="transcript" class="content">
        <p class="placeholder">Your speech will appear here...</p>
      </div>
    </div>
    
    <div class="panel">
      <h3>🤖 AI Response</h3>
      <div id="response" class="content">
        <p class="placeholder">AI responses will appear here...</p>
      </div>
    </div>
    
    <div class="setup-info">
      <p>⚠️ Make sure you've:</p>
      <ol>
        <li>Built the main package: <code>pnpm run build</code></li>
        <li>Created <code>.env</code> file with your API keys</li>
        <li>Installed dependencies: <code>pnpm install</code></li>
      </ol>
    </div>
  </div>
`;

// Import and initialize the app logic
import { initializeApp } from './app';

initializeApp();
