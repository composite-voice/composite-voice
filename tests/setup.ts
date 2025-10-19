/**
 * Jest setup file
 */

// Mock browser APIs that aren't available in jsdom

// Mock AudioContext
global.AudioContext = jest.fn().mockImplementation(() => ({
  createMediaStreamSource: jest.fn(),
  createScriptProcessor: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    onaudioprocess: null,
  })),
  createBufferSource: jest.fn(() => ({
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null,
  })),
  createBuffer: jest.fn(),
  decodeAudioData: jest.fn(),
  destination: {},
  sampleRate: 48000,
  state: 'running',
  suspend: jest.fn(),
  resume: jest.fn(),
  close: jest.fn(),
})) as unknown as typeof AudioContext;

// Mock MediaStream
global.MediaStream = jest.fn().mockImplementation(() => ({
  getTracks: jest.fn(() => [
    {
      stop: jest.fn(),
      kind: 'audio',
      enabled: true,
    },
  ]),
})) as unknown as typeof MediaStream;

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: jest.fn().mockResolvedValue(new MediaStream()),
  },
});

// Mock Web Speech API
const MockSpeechRecognition = jest.fn().mockImplementation(() => ({
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  onaudiostart: null,
  onaudioend: null,
  onend: null,
  onerror: null,
  onnomatch: null,
  onresult: null,
  onsoundstart: null,
  onsoundend: null,
  onspeechend: null,
  onspeechstart: null,
  onstart: null,
  continuous: false,
  interimResults: false,
  lang: 'en-US',
  maxAlternatives: 1,
}));

(global as any).SpeechRecognition = MockSpeechRecognition;
(global as any).webkitSpeechRecognition = MockSpeechRecognition;

global.SpeechSynthesis = jest.fn().mockImplementation(() => ({
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn(() => []),
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null,
})) as unknown as typeof SpeechSynthesis;

global.speechSynthesis = new SpeechSynthesis();

global.SpeechSynthesisUtterance = jest.fn().mockImplementation((text: string) => ({
  text,
  lang: 'en-US',
  voice: null,
  volume: 1,
  rate: 1,
  pitch: 1,
  onstart: null,
  onend: null,
  onerror: null,
  onpause: null,
  onresume: null,
  onmark: null,
  onboundary: null,
})) as unknown as typeof SpeechSynthesisUtterance;

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation((url: string) => ({
  url,
  readyState: 0,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
})) as unknown as typeof WebSocket;

// Add WebSocket static properties
Object.defineProperty(global.WebSocket, 'CONNECTING', { value: 0 });
Object.defineProperty(global.WebSocket, 'OPEN', { value: 1 });
Object.defineProperty(global.WebSocket, 'CLOSING', { value: 2 });
Object.defineProperty(global.WebSocket, 'CLOSED', { value: 3 });
