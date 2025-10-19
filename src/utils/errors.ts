/**
 * Custom error classes for CompositeVoice SDK
 */

/**
 * Base error class for all SDK errors
 */
export class CompositeVoiceError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly context: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    recoverable = false,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CompositeVoiceError';
    this.code = code;
    this.recoverable = recoverable;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Provider initialization error
 */
export class ProviderInitializationError extends CompositeVoiceError {
  constructor(providerName: string, cause?: Error) {
    super(`Failed to initialize provider: ${providerName}`, 'PROVIDER_INIT_ERROR', false, {
      providerName,
      cause,
    });
    this.name = 'ProviderInitializationError';
  }
}

/**
 * Provider connection error
 */
export class ProviderConnectionError extends CompositeVoiceError {
  constructor(providerName: string, cause?: Error) {
    super(`Failed to connect to provider: ${providerName}`, 'PROVIDER_CONNECTION_ERROR', true, {
      providerName,
      cause,
    });
    this.name = 'ProviderConnectionError';
  }
}

/**
 * Audio capture error
 */
export class AudioCaptureError extends CompositeVoiceError {
  constructor(message: string, cause?: Error) {
    super(`Audio capture error: ${message}`, 'AUDIO_CAPTURE_ERROR', true, { cause });
    this.name = 'AudioCaptureError';
  }
}

/**
 * Audio playback error
 */
export class AudioPlaybackError extends CompositeVoiceError {
  constructor(message: string, cause?: Error) {
    super(`Audio playback error: ${message}`, 'AUDIO_PLAYBACK_ERROR', true, { cause });
    this.name = 'AudioPlaybackError';
  }
}

/**
 * Microphone permission error
 */
export class MicrophonePermissionError extends CompositeVoiceError {
  constructor() {
    super('Microphone permission denied', 'MICROPHONE_PERMISSION_DENIED', false);
    this.name = 'MicrophonePermissionError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends CompositeVoiceError {
  constructor(message: string) {
    super(`Configuration error: ${message}`, 'CONFIGURATION_ERROR', false);
    this.name = 'ConfigurationError';
  }
}

/**
 * Invalid state error
 */
export class InvalidStateError extends CompositeVoiceError {
  constructor(currentState: string, attemptedAction: string) {
    super(
      `Cannot perform "${attemptedAction}" in current state: ${currentState}`,
      'INVALID_STATE_ERROR',
      false,
      { currentState, attemptedAction }
    );
    this.name = 'InvalidStateError';
  }
}

/**
 * Provider response error
 */
export class ProviderResponseError extends CompositeVoiceError {
  constructor(providerName: string, statusCode?: number, message?: string) {
    super(
      `Provider error from ${providerName}: ${message || 'Unknown error'}`,
      'PROVIDER_RESPONSE_ERROR',
      true,
      { providerName, statusCode, message }
    );
    this.name = 'ProviderResponseError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends CompositeVoiceError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', true, {
      operation,
      timeoutMs,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * WebSocket error
 */
export class WebSocketError extends CompositeVoiceError {
  constructor(message: string, code?: number) {
    super(`WebSocket error: ${message}`, 'WEBSOCKET_ERROR', true, { code });
    this.name = 'WebSocketError';
  }
}
