"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramWebSocketError = exports.DeepgramVersionError = exports.DeepgramUnknownError = exports.DeepgramApiError = exports.isDeepgramError = exports.DeepgramError = void 0;
class DeepgramError extends Error {
    constructor(message) {
        super(message);
        this.__dgError = true;
        this.name = "DeepgramError";
    }
}
exports.DeepgramError = DeepgramError;
function isDeepgramError(error) {
    return typeof error === "object" && error !== null && "__dgError" in error;
}
exports.isDeepgramError = isDeepgramError;
class DeepgramApiError extends DeepgramError {
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
exports.DeepgramApiError = DeepgramApiError;
class DeepgramUnknownError extends DeepgramError {
    constructor(message, originalError) {
        super(message);
        this.name = "DeepgramUnknownError";
        this.originalError = originalError;
    }
}
exports.DeepgramUnknownError = DeepgramUnknownError;
class DeepgramVersionError extends DeepgramError {
    constructor() {
        super(`You are attempting to use an old format for a newer SDK version. Read more here: https://dpgr.am/js-v3`);
        this.name = "DeepgramVersionError";
    }
}
exports.DeepgramVersionError = DeepgramVersionError;
/**
 * Enhanced WebSocket error that captures additional debugging information
 * including status codes, request IDs, and response headers when available.
 */
class DeepgramWebSocketError extends DeepgramError {
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
exports.DeepgramWebSocketError = DeepgramWebSocketError;
//# sourceMappingURL=errors.js.map