/**
 * Logging utilities for the CompositeVoice SDK.
 *
 * @remarks
 * This module provides a structured logging system with configurable log levels,
 * context-aware message formatting, and support for custom logger implementations.
 * Logging is disabled by default and must be explicitly enabled via the
 * {@link LoggingConfig} configuration.
 *
 * Log messages are formatted as: `[ISO-timestamp] [LEVEL] [context] message`
 *
 * @example
 * ```typescript
 * import { createLogger, LogLevel } from 'composite-voice';
 *
 * const logger = createLogger('MyComponent', {
 *   enabled: true,
 *   level: 'debug',
 * });
 *
 * logger.info('Component initialized', { version: '1.0.0' });
 * logger.debug('Processing data', { itemCount: 42 });
 * logger.warn('Deprecated API used');
 * logger.error('Failed to connect', new Error('timeout'));
 * ```
 *
 * @packageDocumentation
 */

import type { LoggingConfig } from '../core/types/config';

/**
 * Numeric log level values for severity-based filtering.
 *
 * @remarks
 * Log messages are only output if their level is greater than or equal to
 * the configured minimum level. Levels are ordered from most verbose
 * ({@link LogLevel.DEBUG}) to least verbose ({@link LogLevel.NONE}).
 *
 * @example
 * ```typescript
 * // With level set to WARN, only WARN and ERROR messages are output
 * // DEBUG and INFO messages are suppressed
 * ```
 */
export enum LogLevel {
  /** Detailed debugging information. Lowest severity. */
  DEBUG = 0,
  /** General informational messages about normal operation. */
  INFO = 1,
  /** Potentially harmful situations or unexpected conditions. */
  WARN = 2,
  /** Error events that may still allow continued operation. */
  ERROR = 3,
  /** Disables all logging output. */
  NONE = 4,
}

/**
 * Structured logger with context-aware formatting and configurable levels.
 *
 * @remarks
 * The Logger class provides four severity methods ({@link Logger.debug},
 * {@link Logger.info}, {@link Logger.warn}, {@link Logger.error}) that
 * respect the configured minimum log level. Messages are prefixed with a
 * timestamp, level, and context string for easy filtering.
 *
 * Supports custom logger functions for integration with external logging
 * systems (e.g., Sentry, DataDog, or structured JSON logging).
 *
 * Child loggers can be created with {@link Logger.child} to add nested
 * context (e.g., `'CompositeVoice:STT:DeepgramSTT'`).
 *
 * @example
 * ```typescript
 * import { Logger } from 'composite-voice';
 *
 * const logger = new Logger('MyProvider', {
 *   enabled: true,
 *   level: 'info',
 * });
 *
 * logger.info('Provider ready');
 *
 * // Create a child logger with additional context
 * const childLogger = logger.child('WebSocket');
 * childLogger.debug('Connection established'); // [timestamp] [DEBUG] [MyProvider:WebSocket] ...
 * ```
 */
export class Logger {
  private enabled: boolean;
  private level: 'debug' | 'info' | 'warn' | 'error';
  private customLogger?: (level: string, message: string, ...args: unknown[]) => void;
  private context: string;

  /**
   * Creates a new Logger instance.
   *
   * @param context - A label identifying the source of log messages (e.g., `'DeepgramTTS'`).
   * @param config - Logging configuration controlling enabled state, level, and custom logger.
   *
   * @example
   * ```typescript
   * const logger = new Logger('CompositeVoice', {
   *   enabled: true,
   *   level: 'debug',
   *   logger: (level, message, ...args) => {
   *     // Custom logging integration
   *     externalLogger.log({ level, message, args });
   *   },
   * });
   * ```
   */
  constructor(context: string, config: LoggingConfig) {
    this.context = context;
    this.enabled = config.enabled ?? false;
    this.level = config.level ?? 'info';
    if (config.logger !== undefined) {
      this.customLogger = config.logger;
    }
  }

  /**
   * Converts a string log level name to its corresponding numeric {@link LogLevel} value.
   *
   * @param level - The log level name string.
   * @returns The numeric {@link LogLevel} value.
   */
  private getLogLevel(level: string): LogLevel {
    switch (level) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * Determines whether a message at the given level should be logged.
   *
   * @remarks
   * Returns `false` when logging is disabled. Otherwise, compares the
   * message level against the configured minimum level.
   *
   * @param level - The numeric log level of the message to check.
   * @returns `true` if the message should be logged, `false` otherwise.
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) {
      return false;
    }
    const configLevel = this.getLogLevel(this.level);
    return level >= configLevel;
  }

  /**
   * Formats a log message with timestamp, level, and context prefix.
   *
   * @param level - The log level name string.
   * @param message - The message to format.
   * @returns The formatted log string in the format `[ISO-timestamp] [LEVEL] [context] message`.
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  /**
   * Logs a debug-level message.
   *
   * @remarks
   * Debug messages provide detailed diagnostic information useful during
   * development. They are only output when the configured level is
   * {@link LogLevel.DEBUG} or lower.
   *
   * @param message - The debug message to log.
   * @param args - Additional data to include in the log output.
   */
  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) {
      return;
    }

    const formatted = this.formatMessage('debug', message);
    if (this.customLogger) {
      this.customLogger('debug', formatted, ...args);
    } else {
      console.debug(formatted, ...args);
    }
  }

  /**
   * Logs an info-level message.
   *
   * @remarks
   * Info messages describe normal operational events such as initialization,
   * connection establishment, or configuration details.
   *
   * @param message - The informational message to log.
   * @param args - Additional data to include in the log output.
   */
  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.INFO)) {
      return;
    }

    const formatted = this.formatMessage('info', message);
    if (this.customLogger) {
      this.customLogger('info', formatted, ...args);
    } else {
      console.info(formatted, ...args);
    }
  }

  /**
   * Logs a warning-level message.
   *
   * @remarks
   * Warning messages indicate potentially harmful situations or unexpected
   * conditions that do not prevent normal operation but may warrant attention.
   *
   * @param message - The warning message to log.
   * @param args - Additional data to include in the log output.
   */
  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.WARN)) {
      return;
    }

    const formatted = this.formatMessage('warn', message);
    if (this.customLogger) {
      this.customLogger('warn', formatted, ...args);
    } else {
      console.warn(formatted, ...args);
    }
  }

  /**
   * Logs an error-level message.
   *
   * @remarks
   * Error messages indicate failures that may prevent normal operation.
   * Always output unless logging is disabled entirely.
   *
   * @param message - The error message to log.
   * @param args - Additional data to include in the log output (typically error objects).
   */
  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) {
      return;
    }

    const formatted = this.formatMessage('error', message);
    if (this.customLogger) {
      this.customLogger('error', formatted, ...args);
    } else {
      console.error(formatted, ...args);
    }
  }

  /**
   * Creates a child logger with a nested context label.
   *
   * @remarks
   * The child logger inherits the parent's configuration (enabled state,
   * level, custom logger) and appends the child context to the parent
   * context with a colon separator.
   *
   * @param childContext - The context label for the child logger.
   * @returns A new {@link Logger} instance with the combined context `parent:child`.
   *
   * @example
   * ```typescript
   * const parentLogger = new Logger('CompositeVoice', { enabled: true, level: 'debug' });
   * const childLogger = parentLogger.child('DeepgramTTS');
   * // Child context: 'CompositeVoice:DeepgramTTS'
   * childLogger.info('Connected'); // [timestamp] [INFO] [CompositeVoice:DeepgramTTS] Connected
   * ```
   */
  child(childContext: string): Logger {
    const config: LoggingConfig = {
      enabled: this.enabled,
      level: this.level,
    };
    if (this.customLogger !== undefined) {
      config.logger = this.customLogger;
    }
    return new Logger(`${this.context}:${childContext}`, config);
  }
}

/**
 * Factory function to create a new {@link Logger} instance.
 *
 * @remarks
 * This is a convenience wrapper around the {@link Logger} constructor.
 * Useful when you prefer a functional style or need to create loggers
 * dynamically.
 *
 * @param context - A label identifying the source of log messages.
 * @param config - Logging configuration controlling enabled state, level, and custom logger.
 * @returns A new {@link Logger} instance.
 *
 * @example
 * ```typescript
 * import { createLogger } from 'composite-voice';
 *
 * const logger = createLogger('MyApp', { enabled: true, level: 'info' });
 * logger.info('Application started');
 * ```
 */
export function createLogger(context: string, config: LoggingConfig): Logger {
  return new Logger(context, config);
}
