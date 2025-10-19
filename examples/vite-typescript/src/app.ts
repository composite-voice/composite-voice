import { CompositeVoice, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';
// Uncomment when you have API keys:
// import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';

export async function initializeApp() {
  const statusEl = document.getElementById('status-text')!;
  const indicatorEl = document.getElementById('indicator')!;
  const listenBtn = document.getElementById('listen-btn') as HTMLButtonElement;
  const listenIcon = document.getElementById('listen-icon')!;
  const listenText = document.getElementById('listen-text')!;
  const transcriptEl = document.getElementById('transcript')!;
  const responseEl = document.getElementById('response')!;

  let isListening = false;

  // Update UI based on agent state
  function updateStatus(state: string) {
    statusEl.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    indicatorEl.className = `status-indicator ${state}`;
  }

  // Add message to transcript
  function addTranscript(text: string, isFinal = false) {
    if (transcriptEl.querySelector('.placeholder')) {
      transcriptEl.innerHTML = '';
    }
    const p = document.createElement('p');
    p.textContent = text;
    p.className = isFinal ? 'final' : 'interim';
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  // Add message to response
  function addResponse(text: string) {
    if (responseEl.querySelector('.placeholder')) {
      responseEl.innerHTML = '';
    }
    const p = document.createElement('p');
    p.textContent = text;
    responseEl.appendChild(p);
    responseEl.scrollTop = responseEl.scrollHeight;
  }

  try {
    updateStatus('Initializing...');

    // Create mock LLM for demo (replace with real LLM when you have API keys)
    const mockLLM = {
      type: 'rest' as const,
      config: { model: 'mock' },
      async initialize() {},
      async dispose() {},
      isReady() {
        return true;
      },
      async generate(prompt: string) {
        const response = `You said: "${prompt}". This is a mock response. Add your OpenAI API key to .env to use a real LLM.`;
        return {
          async *[Symbol.asyncIterator]() {
            for (const word of response.split(' ')) {
              yield word + ' ';
              await new Promise((r) => setTimeout(r, 50));
            }
          },
        };
      },
      async generateFromMessages() {
        return this.generate('');
      },
    };

    // Initialize agent
    const agent = new CompositeVoice({
      mode: 'composite',
      stt: new NativeSTT({ language: 'en-US', interimResults: true }),
      llm: mockLLM,
      tts: new NativeTTS({ rate: 1.0 }),
      logging: { enabled: true, level: 'info' },
    });

    // Set up event listeners
    agent.on('agent.stateChange', (event) => {
      updateStatus(event.state);
    });

    agent.on('transcription.interim', (event) => {
      addTranscript(event.text, false);
    });

    agent.on('transcription.final', (event) => {
      addTranscript(event.text, true);
    });

    agent.on('llm.chunk', (event) => {
      // Update last response element if it's still streaming
      const lastP = responseEl.querySelector('p:last-child');
      if (lastP && lastP.classList.contains('streaming')) {
        lastP.textContent += event.chunk;
      } else {
        const p = document.createElement('p');
        p.className = 'streaming';
        p.textContent = event.chunk;
        if (responseEl.querySelector('.placeholder')) {
          responseEl.innerHTML = '';
        }
        responseEl.appendChild(p);
      }
      responseEl.scrollTop = responseEl.scrollHeight;
    });

    agent.on('llm.complete', () => {
      // Mark streaming as complete
      const lastP = responseEl.querySelector('p:last-child');
      if (lastP) {
        lastP.classList.remove('streaming');
      }
    });

    agent.on('agent.error', (event) => {
      console.error('Agent error:', event.error);
      addResponse(`❌ Error: ${event.error.message}`);
    });

    await agent.initialize();

    // Enable button
    listenBtn.disabled = false;

    // Handle listen button
    listenBtn.addEventListener('click', async () => {
      if (!isListening) {
        listenIcon.textContent = '⏹️';
        listenText.textContent = 'Stop Listening';
        listenBtn.classList.add('active');
        await agent.startListening();
        isListening = true;
      } else {
        listenIcon.textContent = '🎤';
        listenText.textContent = 'Start Listening';
        listenBtn.classList.remove('active');
        await agent.stopListening();
        isListening = false;
      }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      void agent.dispose();
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
    updateStatus('Error');
    addResponse(`❌ Failed to initialize: ${(error as Error).message}`);
  }
}
