export class DeepgramError extends Error {
    constructor(message) {
        super(message);
        this.__dgError = true;
        this.name = "DeepgramError";
    }
}
export function isDeepgramError(error) {
    return typeof error === "object" && error !== null && "__dgError" in error;
}
export class DeepgramApiError extends DeepgramError {
    constructor(message, status) {
        super(message);
        this.name = "DeepgramApiError";
        this.status = status;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
        };
    }
}
export class DeepgramUnknownError extends DeepgramError {
    constructor(message, originalError) {
        super(message);
        this.name = "DeepgramUnknownError";
        this.originalError = originalError;
    }
}
export class DeepgramVersionError extends DeepgramError {
    constructor() {
        super(`You are attempting to use an old format for a newer SDK version. Read more here: https://dpgr.am/js-v3`);
        this.name = "DeepgramVersionError";
    }
}
/**
 * Enhanced WebSocket error that captures additional debugging information
 * including status codes, request IDs, and response headers when available.
 */
export class DeepgramWebSocketError extends DeepgramError {
    constructor(message, options = {}) {
        super(message);
        this.name = "DeepgramWebSocketError";
        this.originalEvent = options.originalEvent;
        this.statusCode = options.statusCode;
        this.requestId = options.requestId;
        this.responseHeaders = options.responseHeaders;
        this.url = options.url;
        this.readyState = options.readyState;
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            requestId: this.requestId,
            responseHeaders: this.responseHeaders,
            url: this.url,
            readyState: this.readyState,
            originalEvent: this.originalEvent
                ? {
                    type: this.originalEvent.type,
                    timeStamp: this.originalEvent.timeStamp,
                }
                : undefined,
        };
    }
}
//# sourceMappingURL=errors.js.map