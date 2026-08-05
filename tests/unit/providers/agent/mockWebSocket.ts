/**
 * Shared WebSocket mock for agent provider tests.
 *
 * @remarks
 * Agent providers construct `new WebSocket(url, protocols?)` directly and
 * check `readyState` against the `WebSocket.OPEN` static. This mock mirrors
 * that surface and exposes `_open` / `_message` / `_error` / `_close`
 * helpers for simulating server-side behaviour, plus `sentJson()` for
 * asserting on JSON frames the provider sent.
 */

let currentSocket: MockAgentWebSocket | null = null;

export class MockAgentWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols: string | string[] | undefined;
  binaryType = 'blob';
  readyState = MockAgentWebSocket.CONNECTING;

  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockAgentWebSocket.CLOSED;
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    currentSocket = this;
  }

  /** Simulate the WebSocket `open` event. */
  _open(): void {
    this.readyState = MockAgentWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  /** Simulate a server message (JSON object, string, or binary frame). */
  _message(data: Record<string, unknown> | string | ArrayBuffer): void {
    const payload = typeof data === 'object' && !(data instanceof ArrayBuffer)
      ? JSON.stringify(data)
      : data;
    this.onmessage?.({ data: payload } as MessageEvent);
  }

  /** Simulate a WebSocket error. */
  _error(): void {
    this.onerror?.({} as Event);
  }

  /** Simulate the WebSocket `close` event. */
  _close(code = 1000, reason = ''): void {
    this.readyState = MockAgentWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  /** All JSON frames the provider sent, parsed. */
  sentJson(): Array<Record<string, unknown>> {
    return this.send.mock.calls
      .filter((call): call is [string] => typeof call[0] === 'string')
      .map((call) => JSON.parse(call[0]) as Record<string, unknown>);
  }
}

/** Install the mock as the global WebSocket constructor. */
export function installMockWebSocket(): void {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockAgentWebSocket;
}

/** The most recently constructed mock socket. */
export function getLastSocket(): MockAgentWebSocket {
  if (!currentSocket) throw new Error('No MockAgentWebSocket constructed yet');
  return currentSocket;
}

/**
 * Wait for the provider's `connect()` to construct its WebSocket.
 *
 * @remarks
 * Agent providers resolve async auth (API key factories, signed URLs)
 * before calling `new WebSocket(...)`, so the socket does not exist
 * synchronously after `connect()` is invoked.
 */
export async function waitForSocket(): Promise<MockAgentWebSocket> {
  for (let i = 0; i < 20; i++) {
    if (currentSocket) return currentSocket;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('No MockAgentWebSocket constructed within the wait window');
}

/** Forget the current socket (call from beforeEach). */
export function resetMockWebSocket(): void {
  currentSocket = null;
}
