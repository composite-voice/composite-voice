/**
 * Logging utilities for CompositeVoice SDK
 */

import type { LoggingConfig } from '../core/types/config';

/**
 * Log level enum
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger class
 */
export class Logger {
  private enabled: boolean;
  private level: 'debug' | 'info' | 'warn' | 'error';
  private customLogger?: (level: string, message: string, ...args: unknown[]) => void;
  private context: string;

  constructor(context: string, config: LoggingConfig) {
    this.context = context;
    this.enabled = config.enabled ?? false;
    this.level = config.level ?? 'info';
    if (config.logger !== undefined) {
      this.customLogger = config.logger;
    }
  }

  /**
   * Get numeric log level
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
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) {
      return false;
    }
    const configLevel = this.getLogLevel(this.level);
    return level >= configLevel;
  }

  /**
   * Format log message
   */
  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  /**
   * Log a debug message
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
   * Log an info message
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
   * Log a warning message
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
   * Log an error message
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
   * Create a child logger with additional context
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
 * Create a logger instance
 */
export function createLogger(context: string, config: LoggingConfig): Logger {
  return new Logger(context, config);
}
