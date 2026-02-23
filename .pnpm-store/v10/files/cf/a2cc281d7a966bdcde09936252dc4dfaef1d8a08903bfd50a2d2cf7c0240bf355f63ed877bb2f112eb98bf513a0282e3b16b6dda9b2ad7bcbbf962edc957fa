import { AbstractClient } from "./AbstractClient";
import { CONNECTION_STATE, SOCKET_STATES } from "../lib/constants";
import type { DeepgramClientOptions, LiveSchema } from "../lib/types";
import type { WebSocket as WSWebSocket } from "ws";
import { DeepgramWebSocketError } from "../lib/errors";
/**
 * Represents a constructor for a WebSocket-like object that can be used in the application.
 * The constructor takes the following parameters:
 * @param address - The URL or address of the WebSocket server.
 * @param _ignored - An optional parameter that is ignored.
 * @param options - An optional object containing headers to be included in the WebSocket connection.
 * @returns A WebSocket-like object that implements the WebSocketLike interface.
 */
interface WebSocketLikeConstructor {
    new (address: string | URL, _ignored?: any, options?: {
        headers: object | undefined;
    }): WebSocketLike;
}
/**
 * Represents the types of WebSocket-like connections that can be used in the application.
 * This type is used to provide a common interface for different WebSocket implementations,
 * such as the native WebSocket API, a WebSocket wrapper library, or a dummy implementation
 * for testing purposes.
 */
type WebSocketLike = WebSocket | WSWebSocket | WSWebSocketDummy;
/**
 * Represents the types of data that can be sent or received over a WebSocket-like connection.
 */
type SocketDataLike = string | ArrayBufferLike | Blob;
/**
 * Represents an abstract live client that extends the AbstractClient class.
 * The AbstractLiveClient class provides functionality for connecting, reconnecting, and disconnecting a WebSocket connection, as well as sending data over the connection.
 * Subclasses of this class are responsible for setting up the connection event handlers.
 *
 * @abstract
 */
export declare abstract class AbstractLiveClient extends AbstractClient {
    headers: {
        [key: string]: string;
    };
    transport: WebSocketLikeConstructor | null;
    conn: WebSocketLike | null;
    sendBuffer: Function[];
    constructor(options: DeepgramClientOptions);
    /**
     * Connects the socket, unless already connected.
     *
     * @protected Can only be called from within the class.
     */
    protected connect(transcriptionOptions: LiveSchema, endpoint: string): void;
    /**
     * Reconnects the socket using new or existing transcription options.
     *
     * @param options - The transcription options to use when reconnecting the socket.
     */
    reconnect: (options: LiveSchema) => void;
    /**
     * Disconnects the socket from the client.
     *
     * @param code A numeric status code to send on disconnect.
     * @param reason A custom reason for the disconnect.
     */
    disconnect(code?: number, reason?: string): void;
    /**
     * Returns the current connection state of the WebSocket connection.
     *
     * @returns The current connection state of the WebSocket connection.
     */
    connectionState(): CONNECTION_STATE;
    /**
     * Returns the current ready state of the WebSocket connection.
     *
     * @returns The current ready state of the WebSocket connection.
     */
    getReadyState(): SOCKET_STATES;
    /**
     * Returns `true` is the connection is open.
     */
    isConnected(): boolean;
    /**
     * Sends data to the Deepgram API via websocket connection
     * @param data Audio data to send to Deepgram
     *
     * Conforms to RFC #146 for Node.js - does not send an empty byte.
     * @see https://github.com/deepgram/deepgram-python-sdk/issues/146
     */
    send(data: SocketDataLike): void;
    /**
     * Determines whether the current instance should proxy requests.
     * @returns {boolean} true if the current instance should proxy requests; otherwise, false
     */
    get proxy(): boolean;
    /**
     * Extracts enhanced error information from a WebSocket error event.
     * This method attempts to capture additional debugging information such as
     * status codes, request IDs, and response headers when available.
     *
     * @example
     * ```typescript
     * // Enhanced error information is now available in error events:
     * connection.on(LiveTranscriptionEvents.Error, (err) => {
     *   console.error("WebSocket Error:", err.message);
     *
     *   // Access HTTP status code (e.g., 502, 403, etc.)
     *   if (err.statusCode) {
     *     console.error(`HTTP Status Code: ${err.statusCode}`);
     *   }
     *
     *   // Access Deepgram request ID for support tickets
     *   if (err.requestId) {
     *     console.error(`Deepgram Request ID: ${err.requestId}`);
     *   }
     *
     *   // Access WebSocket URL and connection state
     *   if (err.url) {
     *     console.error(`WebSocket URL: ${err.url}`);
     *   }
     *
     *   if (err.readyState !== undefined) {
     *     const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
     *     console.error(`Connection State: ${stateNames[err.readyState]}`);
     *   }
     *
     *   // Access response headers for additional debugging
     *   if (err.responseHeaders) {
     *     console.error("Response Headers:", err.responseHeaders);
     *   }
     *
     *   // Access the enhanced error object for detailed debugging
     *   if (err.error?.name === 'DeepgramWebSocketError') {
     *     console.error("Enhanced Error Details:", err.error.toJSON());
     *   }
     * });
     * ```
     *
     * @param event - The error event from the WebSocket
     * @param conn - The WebSocket connection object
     * @returns Enhanced error information object
     */
    protected extractErrorInformation(event: ErrorEvent | Event, conn?: WebSocketLike): {
        statusCode?: number;
        requestId?: string;
        responseHeaders?: Record<string, string>;
        url?: string;
        readyState?: number;
    };
    /**
     * Creates an enhanced error object with additional debugging information.
     * This method provides backward compatibility by including both the original
     * error event and enhanced error information.
     *
     * @param event - The original error event
     * @param enhancedInfo - Additional error information extracted from the connection
     * @returns An object containing both original and enhanced error information
     */
    protected createEnhancedError(event: ErrorEvent | Event, enhancedInfo: {
        statusCode?: number;
        requestId?: string;
        responseHeaders?: Record<string, string>;
        url?: string;
        readyState?: number;
    }): {
        error: DeepgramWebSocketError;
        statusCode: number | undefined;
        requestId: string | undefined;
        responseHeaders: Record<string, string> | undefined;
        url: string | undefined;
        readyState: number | undefined;
        message: string;
        bubbles: boolean;
        cancelBubble: boolean;
        cancelable: boolean;
        composed: boolean;
        currentTarget: EventTarget | null;
        defaultPrevented: boolean;
        eventPhase: number;
        isTrusted: boolean;
        returnValue: boolean;
        srcElement: EventTarget | null;
        target: EventTarget | null;
        timeStamp: number;
        type: string;
        composedPath(): EventTarget[];
        initEvent(type: string, bubbles?: boolean | undefined, cancelable?: boolean | undefined): void;
        preventDefault(): void;
        stopImmediatePropagation(): void;
        stopPropagation(): void;
        AT_TARGET: number;
        BUBBLING_PHASE: number;
        CAPTURING_PHASE: number;
        NONE: number;
    } | {
        error: DeepgramWebSocketError;
        statusCode: number | undefined;
        requestId: string | undefined;
        responseHeaders: Record<string, string> | undefined;
        url: string | undefined;
        readyState: number | undefined;
        message: string;
        colno: number;
        filename: string;
        lineno: number;
        bubbles: boolean;
        cancelBubble: boolean;
        cancelable: boolean;
        composed: boolean;
        currentTarget: EventTarget | null;
        defaultPrevented: boolean;
        eventPhase: number;
        isTrusted: boolean;
        returnValue: boolean;
        srcElement: EventTarget | null;
        target: EventTarget | null;
        timeStamp: number;
        type: string;
        composedPath(): EventTarget[];
        initEvent(type: string, bubbles?: boolean | undefined, cancelable?: boolean | undefined): void;
        preventDefault(): void;
        stopImmediatePropagation(): void;
        stopPropagation(): void;
        AT_TARGET: number;
        BUBBLING_PHASE: number;
        CAPTURING_PHASE: number;
        NONE: number;
    };
    /**
     * Builds an enhanced error message with additional context information.
     *
     * @param event - The original error event
     * @param enhancedInfo - Additional error information
     * @returns A more descriptive error message
     */
    protected buildEnhancedErrorMessage(event: ErrorEvent | Event, enhancedInfo: {
        statusCode?: number;
        requestId?: string;
        responseHeaders?: Record<string, string>;
        url?: string;
        readyState?: number;
    }): string;
    /**
     * Sets up the standard connection event handlers (open, close, error) for WebSocket connections.
     * This method abstracts the common connection event registration pattern used across all live clients.
     *
     * @param events - Object containing the event constants for the specific client type
     * @param events.Open - Event constant for connection open
     * @param events.Close - Event constant for connection close
     * @param events.Error - Event constant for connection error
     * @protected
     */
    protected setupConnectionEvents(events: {
        Open: string;
        Close: string;
        Error: string;
    }): void;
    /**
     * Sets up the connection event handlers.
     *
     * @abstract Requires subclasses to set up context aware event handlers.
     */
    abstract setupConnection(): void;
}
declare class WSWebSocketDummy {
    binaryType: string;
    close: Function;
    onclose: Function;
    onerror: Function;
    onmessage: Function;
    onopen: Function;
    readyState: number;
    send: Function;
    url: string | URL | null;
    constructor(address: URL, _protocols: undefined, options: {
        close: Function;
    });
}
export { AbstractLiveClient as AbstractWsClient };
//# sourceMappingURL=AbstractLiveClient.d.ts.map