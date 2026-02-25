/**
 * Custom error classes for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines a hierarchy of typed error classes used throughout the SDK.
 * All errors extend {@link CompositeVoiceError}, which adds structured metadata
 * including an error `code`, a `recoverable` flag, and optional `context` data.
 *
 * The `recoverable` flag indicates whether the SDK or application can reasonably
 * attempt to recover from the error (e.g., by retrying a connection) versus
 * errors that require user intervention (e.g., missing configuration).
 *
 * @example
 * ```typescript
 * import { CompositeVoiceError, ProviderConnectionError } from 'composite-voice';
 *
 * try {
 *   await tts.connect();
 * } catch (error) {
 *   if (error instanceof CompositeVoiceError) {
 *     console.error(`[${error.code}] ${error.message}`);
 *     if (error.recoverable) {
 *       // Attempt retry logic
 *     }
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

/**
 * Base error class for all CompositeVoice SDK errors.
 *
 * @remarks
 * All SDK-specific errors extend this class, making it possible to catch
 * any SDK error with a single `instanceof CompositeVoiceError` check. Each
 * error carries a machine-readable `code` string, a `recoverable` flag, and
 * optional `context` with additional diagnostic data.
 *
 * Uses `Error.captureStackTrace` when available (V8 engines) to maintain
 * clean stack traces that point to the throw site rather than the error
 * constructor.
 *
 * @example
 * ```typescript
 * try {
 *   await voice.start();
 * } catch (error) {
 *   if (error instanceof CompositeVoiceError) {
 *     console.error(`Error [${error.code}]: ${error.message}`);
 *     console.log('Recoverable:', error.recoverable);
 *     console.log('Context:', error.context);
 *   }
 * }
 * ```
 */
export class CompositeVoiceError extends Error {
  /** Machine-readable error code (e.g., `'PROVIDER_INIT_ERROR'`, `'TIMEOUT_ERROR'`). */
  public readonly code: string;

  /**
   * Whether the error is potentially recoverable.
   *
   * @remarks
   * When `true`, the application or SDK may attempt to recover (e.g., retry
   * a connection). When `false`, user intervention is typically required.
   */
  public readonly recoverable: boolean;

  /** Optional structured context data for diagnostic purposes. */
  public readonly context: Record<string, unknown> | undefined;

  /**
   * Creates a new CompositeVoiceError.
   *
   * @param message - Human-readable error message.
   * @param code - Machine-readable error code string.
   * @param recoverable - Whether the error is potentially recoverable.
   * @param context - Optional additional context for diagnostics.
   *
   * @defaultValue recoverable: `false`
   */
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
 * Error thrown when a provider fails to initialize.
 *
 * @remarks
 * Typically caused by missing configuration (e.g., no API key), a missing
 * peer dependency (e.g., `@deepgram/sdk` not installed), or an SDK
 * initialization failure. This error is **not recoverable** -- the
 * configuration must be corrected before retrying.
 *
 * Error code: `'PROVIDER_INIT_ERROR'`
 *
 * @example
 * ```typescript
 * try {
 *   await tts.initialize();
 * } catch (error) {
 *   if (error instanceof ProviderInitializationError) {
 *     console.error(`Provider ${error.context?.providerName} failed to init`);
 *   }
 * }
 * ```
 */
export class ProviderInitializationError extends CompositeVoiceError {
  /**
   * Creates a new ProviderInitializationError.
   *
   * @param providerName - The name of the provider that failed to initialize.
   * @param cause - The underlying error that caused the initialization failure.
   */
  constructor(providerName: string, cause?: Error) {
    super(`Failed to initialize provider: ${providerName}`, 'PROVIDER_INIT_ERROR', false, {
      providerName,
      cause,
    });
    this.name = 'ProviderInitializationError';
  }
}

/**
 * Error thrown when a provider fails to establish a connection.
 *
 * @remarks
 * Typically caused by network issues, invalid credentials, or service
 * unavailability. This error is **recoverable** -- the connection can
 * be retried after a delay.
 *
 * Error code: `'PROVIDER_CONNECTION_ERROR'`
 *
 * @example
 * ```typescript
 * try {
 *   await tts.connect();
 * } catch (error) {
 *   if (error instanceof ProviderConnectionError && error.recoverable) {
 *     // Retry after delay
 *     await delay(1000);
 *     await tts.connect();
 *   }
 * }
 * ```
 */
export class ProviderConnectionError extends CompositeVoiceError {
  /**
   * Creates a new ProviderConnectionError.
   *
   * @param providerName - The name of the provider that failed to connect.
   * @param cause - The underlying error that caused the connection failure.
   */
  constructor(providerName: string, cause?: Error) {
    super(`Failed to connect to provider: ${providerName}`, 'PROVIDER_CONNECTION_ERROR', true, {
      providerName,
      cause,
    });
    this.name = 'ProviderConnectionError';
  }
}

/**
 * Error thrown when audio capture (microphone input) fails.
 *
 * @remarks
 * May occur due to device unavailability, stream interruption, or
 * processing errors. This error is **recoverable** -- audio capture
 * can typically be restarted.
 *
 * Error code: `'AUDIO_CAPTURE_ERROR'`
 */
export class AudioCaptureError extends CompositeVoiceError {
  /**
   * Creates a new AudioCaptureError.
   *
   * @param message - Description of the audio capture failure.
   * @param cause - The underlying error, if any.
   */
  constructor(message: string, cause?: Error) {
    super(`Audio capture error: ${message}`, 'AUDIO_CAPTURE_ERROR', true, { cause });
    this.name = 'AudioCaptureError';
  }
}

/**
 * Error thrown when audio playback fails.
 *
 * @remarks
 * May occur due to AudioContext issues, buffer underruns, or decoding
 * errors. This error is **recoverable** -- playback can typically be
 * restarted or skipped.
 *
 * Error code: `'AUDIO_PLAYBACK_ERROR'`
 */
export class AudioPlaybackError extends CompositeVoiceError {
  /**
   * Creates a new AudioPlaybackError.
   *
   * @param message - Description of the audio playback failure.
   * @param cause - The underlying error, if any.
   */
  constructor(message: string, cause?: Error) {
    super(`Audio playback error: ${message}`, 'AUDIO_PLAYBACK_ERROR', true, { cause });
    this.name = 'AudioPlaybackError';
  }
}

/**
 * Error thrown when microphone access is denied by the user or browser.
 *
 * @remarks
 * This error is **not recoverable** programmatically -- the user must
 * grant microphone permission via the browser's permission UI before
 * the application can capture audio.
 *
 * Error code: `'MICROPHONE_PERMISSION_DENIED'`
 *
 * @example
 * ```typescript
 * try {
 *   await voice.start();
 * } catch (error) {
 *   if (error instanceof MicrophonePermissionError) {
 *     showPermissionDialog('Please allow microphone access to use voice features.');
 *   }
 * }
 * ```
 */
export class MicrophonePermissionError extends CompositeVoiceError {
  /**
   * Creates a new MicrophonePermissionError.
   */
  constructor() {
    super('Microphone permission denied', 'MICROPHONE_PERMISSION_DENIED', false);
    this.name = 'MicrophonePermissionError';
  }
}

/**
 * Error thrown when the SDK configuration is invalid.
 *
 * @remarks
 * Indicates a problem with the provided configuration that must be
 * fixed before the SDK can operate. This error is **not recoverable**
 * at runtime.
 *
 * Error code: `'CONFIGURATION_ERROR'`
 */
export class ConfigurationError extends CompositeVoiceError {
  /**
   * Creates a new ConfigurationError.
   *
   * @param message - Description of the configuration problem.
   */
  constructor(message: string) {
    super(`Configuration error: ${message}`, 'CONFIGURATION_ERROR', false);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when an operation is attempted in an invalid state.
 *
 * @remarks
 * For example, attempting to send text to a TTS provider that is not yet
 * connected, or trying to start a session that is already active. This
 * error is **not recoverable** -- the caller must ensure correct operation
 * ordering.
 *
 * Error code: `'INVALID_STATE_ERROR'`
 *
 * @example
 * ```typescript
 * try {
 *   tts.sendText('Hello'); // throws if not connected
 * } catch (error) {
 *   if (error instanceof InvalidStateError) {
 *     console.error(`Cannot ${error.context?.attemptedAction} in state ${error.context?.currentState}`);
 *   }
 * }
 * ```
 */
export class InvalidStateError extends CompositeVoiceError {
  /**
   * Creates a new InvalidStateError.
   *
   * @param currentState - The current state of the component.
   * @param attemptedAction - The action that was attempted and failed.
   */
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
 * Error thrown when a provider returns an error response.
 *
 * @remarks
 * Wraps HTTP error responses from REST-based providers (e.g., OpenAI TTS
 * returning a 429 rate limit error). This error is **recoverable** --
 * the request can be retried, potentially with backoff.
 *
 * Error code: `'PROVIDER_RESPONSE_ERROR'`
 */
export class ProviderResponseError extends CompositeVoiceError {
  /**
   * Creates a new ProviderResponseError.
   *
   * @param providerName - The name of the provider that returned the error.
   * @param statusCode - The HTTP status code, if applicable.
   * @param message - The error message from the provider.
   */
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
 * Error thrown when an operation exceeds its allowed time limit.
 *
 * @remarks
 * Common for WebSocket connection attempts, API calls, and audio processing
 * operations. This error is **recoverable** -- the operation can be retried.
 *
 * Error code: `'TIMEOUT_ERROR'`
 */
export class TimeoutError extends CompositeVoiceError {
  /**
   * Creates a new TimeoutError.
   *
   * @param operation - A description of the operation that timed out.
   * @param timeoutMs - The timeout duration in milliseconds that was exceeded.
   */
  constructor(operation: string, timeoutMs: number) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', true, {
      operation,
      timeoutMs,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when a WebSocket operation fails.
 *
 * @remarks
 * Covers WebSocket connection errors, send failures, and protocol violations.
 * This error is **recoverable** -- the WebSocket can be reconnected.
 *
 * Error code: `'WEBSOCKET_ERROR'`
 *
 * @see {@link WebSocketManager} for the connection manager that throws this error.
 */
export class WebSocketError extends CompositeVoiceError {
  /**
   * Creates a new WebSocketError.
   *
   * @param message - Description of the WebSocket error.
   * @param code - The WebSocket close code, if applicable.
   */
  constructor(message: string, code?: number) {
    super(`WebSocket error: ${message}`, 'WEBSOCKET_ERROR', true, { code });
    this.name = 'WebSocketError';
  }
}
