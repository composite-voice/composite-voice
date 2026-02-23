export declare class DeepgramError extends Error {
    protected __dgError: boolean;
    constructor(message: string);
}
export declare function isDeepgramError(error: unknown): error is DeepgramError;
export declare class DeepgramApiError extends DeepgramError {
    status: number;
    constructor(message: string, status: number);
    toJSON(): {
        name: string;
        message: string;
        status: number;
    };
}
export declare class DeepgramUnknownError extends DeepgramError {
    originalError: unknown;
    constructor(message: string, originalError: unknown);
}
export declare class DeepgramVersionError extends DeepgramError {
    constructor();
}
/**
 * Enhanced WebSocket error that captures additional debugging information
 * including status codes, request IDs, and response headers when available.
 */
export declare class DeepgramWebSocketError extends DeepgramError {
    originalEvent?: ErrorEvent | Event;
    statusCode?: number;
    requestId?: string;
    responseHeaders?: Record<string, string>;
    url?: string;
    readyState?: number;
    constructor(message: string, options?: {
        originalEvent?: ErrorEvent | Event;
        statusCode?: number;
        requestId?: string;
        responseHeaders?: Record<string, string>;
        url?: string;
        readyState?: number;
    });
    toJSON(): {
        name: string;
        message: string;
        statusCode: number | undefined;
        requestId: string | undefined;
        responseHeaders: Record<string, string> | undefined;
        url: string | undefined;
        readyState: number | undefined;
        originalEvent: {
            type: string;
            timeStamp: number;
        } | undefined;
    };
}
//# sourceMappingURL=errors.d.ts.map