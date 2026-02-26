/**
 * NativeSTT browser mock for Playwright E2E tests.
 *
 * Replaces `window.SpeechRecognition` and `window.webkitSpeechRecognition`
 * with a mock class that fires a realistic event sequence when `start()` is
 * called. Tests can assert against the call log exposed on
 * `window.__sttMockCalls`.
 *
 * Event sequence on start():
 *   onstart -> onaudiostart -> onsoundstart -> onspeechstart ->
 *   onresult (with transcript) ->
 *   onspeechend -> onsoundend -> onaudioend -> onend
 *
 * Configuration (set via window.__sttMockConfig before the mock runs):
 *   - transcript: string  — text returned in onresult (default: "Hello, can you hear me?")
 *   - delayMs: number     — delay before result event sequence (default: 500)
 *   - confidence: number  — confidence score 0-1 (default: 0.95)
 */

/**
 * Browser-side install function. Passed to page.addInitScript() by inject.ts.
 * Must be entirely self-contained — no Node imports or external references.
 */
export function installNativeSTTMock(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;

  // Initialise call log for test assertions
  const calls: Array<{ method: string; timestamp: number; args?: unknown }> = [];
  w.__sttMockCalls = calls;

  function log(method: string, args?: unknown): void {
    calls.push({ method, timestamp: Date.now(), args });
  }

  // Read config (may have been set by a prior addInitScript call)
  const getConfig = (): { transcript: string; delayMs: number; confidence: number } => {
    const cfg = (w.__sttMockConfig as Record<string, unknown>) ?? {};
    return {
      transcript: (cfg.transcript as string) ?? 'Hello, can you hear me?',
      delayMs: (cfg.delayMs as number) ?? 500,
      confidence: (cfg.confidence as number) ?? 0.95,
    };
  };

  /**
   * Minimal mock of the SpeechRecognition API surface used by NativeSTT.
   */
  class MockSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = 'en-US';
    maxAlternatives = 1;

    // Event handler properties set by NativeSTT
    onstart: ((event: Event) => void) | null = null;
    onaudiostart: ((event: Event) => void) | null = null;
    onsoundstart: ((event: Event) => void) | null = null;
    onspeechstart: ((event: Event) => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onspeechend: ((event: Event) => void) | null = null;
    onsoundend: ((event: Event) => void) | null = null;
    onaudioend: ((event: Event) => void) | null = null;
    onend: ((event: Event) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onnomatch: ((event: Event) => void) | null = null;

    private _running = false;
    private _timer: ReturnType<typeof setTimeout> | null = null;

    start(): void {
      log('start');
      if (this._running) {
        throw new DOMException(
          "Failed to execute 'start' on 'SpeechRecognition': recognition has already started.",
          'InvalidStateError'
        );
      }
      this._running = true;

      const { transcript, delayMs, confidence } = getConfig();

      // Helper to fire an event handler if it exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fire = (handler: ((e: any) => void) | null, detail?: unknown): void => {
        if (handler) handler(detail ?? new Event('mock'));
      };

      // Immediate: onstart (browser fires this ~synchronously)
      setTimeout(() => fire(this.onstart), 0);

      // Staggered audio/sound/speech events leading up to the result
      this._timer = setTimeout(() => {
        fire(this.onaudiostart);

        setTimeout(() => fire(this.onsoundstart), 30);
        setTimeout(() => fire(this.onspeechstart), 60);

        // Fire onresult with a mock SpeechRecognitionEvent shape
        setTimeout(() => {
          const alternative = { transcript, confidence };
          const result = {
            isFinal: true,
            length: 1,
            item: () => alternative,
            0: alternative,
          };
          const resultList = {
            length: 1,
            item: () => result,
            0: result,
          };
          const event = {
            type: 'result',
            resultIndex: 0,
            results: resultList,
          };
          fire(this.onresult, event);
        }, 100);

        // Wind-down events
        setTimeout(() => fire(this.onspeechend), 150);
        setTimeout(() => fire(this.onsoundend), 180);
        setTimeout(() => fire(this.onaudioend), 210);
        setTimeout(() => {
          this._running = false;
          fire(this.onend);
        }, 240);
      }, delayMs);
    }

    stop(): void {
      log('stop');
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      this._running = false;
      // Fire onend asynchronously like the real API
      setTimeout(() => {
        if (this.onend) this.onend(new Event('end'));
      }, 0);
    }

    abort(): void {
      log('abort');
      this.stop();
    }

    // EventTarget stubs (NativeSTT uses direct handler properties, not addEventListener)
    addEventListener(): void {
      /* stub */
    }
    removeEventListener(): void {
      /* stub */
    }
    dispatchEvent(): boolean {
      return false;
    }
  }

  // Replace both browser-prefixed globals
  w.SpeechRecognition = MockSpeechRecognition;
  w.webkitSpeechRecognition = MockSpeechRecognition;
}
