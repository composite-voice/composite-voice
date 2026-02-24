/**
 * NativeTTS browser mock for Playwright E2E tests.
 *
 * Wraps `speechSynthesis.speak()` to intercept utterances and simulate
 * playback without producing real audio. Captured utterances (text, voice,
 * rate, pitch) are stored on `window.__ttsMockUtterances` for assertions.
 *
 * The mock preserves `speechSynthesis.getVoices()` by returning a realistic
 * list of synthetic voices so NativeTTS voice selection logic works.
 *
 * Configuration (set via window.__ttsMockConfig before the mock runs):
 *   - speakDelayMs: number — time (ms) between onstart and onend (default: 100)
 */

/**
 * Browser-side install function. Passed to page.addInitScript() by inject.ts.
 * Must be entirely self-contained — no Node imports or external references.
 */
export function installNativeTTSMock(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;

  // Initialise utterance capture array for test assertions
  const utterances: Array<{
    text: string;
    voice: string | null;
    lang: string;
    rate: number;
    pitch: number;
    timestamp: number;
  }> = [];
  w.__ttsMockUtterances = utterances;

  // Realistic voice list matching common Chrome/macOS voices
  const MOCK_VOICES = [
    { name: 'Google US English', lang: 'en-US', localService: false, default: true, voiceURI: 'Google US English' },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false, default: false, voiceURI: 'Google UK English Female' },
    { name: 'Google UK English Male', lang: 'en-GB', localService: false, default: false, voiceURI: 'Google UK English Male' },
    { name: 'Alex', lang: 'en-US', localService: true, default: false, voiceURI: 'Alex' },
    { name: 'Samantha', lang: 'en-US', localService: true, default: false, voiceURI: 'Samantha' },
    { name: 'Google Deutsch', lang: 'de-DE', localService: false, default: false, voiceURI: 'Google Deutsch' },
    { name: 'Google Espanol', lang: 'es-ES', localService: false, default: false, voiceURI: 'Google Espanol' },
    { name: 'Google Francais', lang: 'fr-FR', localService: false, default: false, voiceURI: 'Google Francais' },
    { name: 'Google Japanese', lang: 'ja-JP', localService: false, default: false, voiceURI: 'Google Japanese' },
  ];

  // Read config (may have been set by a prior addInitScript call)
  const getConfig = (): { speakDelayMs: number } => {
    const cfg = (w.__ttsMockConfig as Record<string, unknown>) ?? {};
    return {
      speakDelayMs: (cfg.speakDelayMs as number) ?? 100,
    };
  };

  // Build mock speechSynthesis object
  const mockSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null as ((this: SpeechSynthesis, ev: Event) => void) | null,

    getVoices(): SpeechSynthesisVoice[] {
      return MOCK_VOICES as unknown as SpeechSynthesisVoice[];
    },

    speak(utterance: SpeechSynthesisUtterance): void {
      const { speakDelayMs } = getConfig();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const utt = utterance as any;

      // Capture utterance data for assertions
      utterances.push({
        text: utt.text,
        voice: utt.voice?.name ?? null,
        lang: utt.lang,
        rate: utt.rate,
        pitch: utt.pitch,
        timestamp: Date.now(),
      });

      mockSynthesis.speaking = true;

      // Fire onstart immediately (use plain Event to avoid SpeechSynthesisEvent
      // constructor issues with mock utterances)
      if (utt.onstart) {
        utt.onstart(new Event('start'));
      }

      // Fire onend after delay to simulate speech duration
      setTimeout(() => {
        mockSynthesis.speaking = false;
        if (utt.onend) {
          utt.onend(new Event('end'));
        }
      }, speakDelayMs);
    },

    cancel(): void {
      mockSynthesis.speaking = false;
      mockSynthesis.pending = false;
      mockSynthesis.paused = false;
    },

    pause(): void {
      mockSynthesis.paused = true;
    },

    resume(): void {
      mockSynthesis.paused = false;
    },
  };

  // Mock SpeechSynthesisUtterance so its `voice` setter accepts plain objects.
  // The real browser setter throws TypeError when assigned a non-SpeechSynthesisVoice
  // value, but our mock voices from getVoices() are plain objects.
  const OriginalUtterance = w.SpeechSynthesisUtterance;
  class MockUtterance {
    text: string;
    lang = '';
    voice: unknown = null;
    volume = 1;
    rate = 1;
    pitch = 1;
    onstart: ((ev: Event) => void) | null = null;
    onend: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onpause: ((ev: Event) => void) | null = null;
    onresume: ((ev: Event) => void) | null = null;
    onmark: ((ev: Event) => void) | null = null;
    onboundary: ((ev: Event) => void) | null = null;

    constructor(text = '') {
      this.text = text;
    }
  }

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: MockUtterance,
    writable: true,
    configurable: true,
  });

  // Replace the global speechSynthesis
  Object.defineProperty(window, 'speechSynthesis', {
    value: mockSynthesis,
    writable: true,
    configurable: true,
  });

  // Fire voiceschanged so NativeTTS.loadVoices() resolves immediately
  setTimeout(() => {
    if (mockSynthesis.onvoiceschanged) {
      mockSynthesis.onvoiceschanged.call(
        mockSynthesis as unknown as SpeechSynthesis,
        new Event('voiceschanged'),
      );
    }
  }, 0);
}
