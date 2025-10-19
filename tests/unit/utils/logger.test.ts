/**
 * Logger tests
 */

import { Logger, LogLevel, createLogger } from '../../../src/utils/logger';

describe('Logger', () => {
  let consoleDebug: jest.SpyInstance;
  let consoleInfo: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleDebug = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfo = jest.spyOn(console, 'info').mockImplementation();
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    consoleError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleDebug.mockRestore();
    consoleInfo.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with context', () => {
      const logger = new Logger('TestContext', { enabled: true });

      expect(logger).toBeInstanceOf(Logger);
    });

    it('should use default config values', () => {
      const logger = new Logger('TestContext', { enabled: false });

      logger.info('test');

      // Should not log when enabled is false
      expect(consoleInfo).not.toHaveBeenCalled();
    });
  });

  describe('log levels', () => {
    it('should log debug messages', () => {
      const logger = new Logger('Test', { enabled: true, level: 'debug' });

      logger.debug('Debug message', { extra: 'data' });

      expect(consoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [Test] Debug message'),
        { extra: 'data' }
      );
    });

    it('should log info messages', () => {
      const logger = new Logger('Test', { enabled: true, level: 'info' });

      logger.info('Info message', 123);

      expect(consoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] [Test] Info message'),
        123
      );
    });

    it('should log warn messages', () => {
      const logger = new Logger('Test', { enabled: true, level: 'warn' });

      logger.warn('Warning message');

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] [Test] Warning message')
      );
    });

    it('should log error messages', () => {
      const logger = new Logger('Test', { enabled: true, level: 'error' });

      logger.error('Error message');

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] [Test] Error message')
      );
    });
  });

  describe('log level filtering', () => {
    it('should not log debug when level is info', () => {
      const logger = new Logger('Test', { enabled: true, level: 'info' });

      logger.debug('Debug message');

      expect(consoleDebug).not.toHaveBeenCalled();
    });

    it('should not log debug or info when level is warn', () => {
      const logger = new Logger('Test', { enabled: true, level: 'warn' });

      logger.debug('Debug message');
      logger.info('Info message');

      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
    });

    it('should only log errors when level is error', () => {
      const logger = new Logger('Test', { enabled: true, level: 'error' });

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('disabled logging', () => {
    it('should not log when disabled', () => {
      const logger = new Logger('Test', { enabled: false, level: 'debug' });

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(consoleDebug).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('custom logger', () => {
    it('should use custom logger function', () => {
      const customLogger = jest.fn();
      const logger = new Logger('Test', {
        enabled: true,
        level: 'info',
        logger: customLogger,
      });

      logger.info('Test message', 'arg1', 'arg2');

      expect(customLogger).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('[INFO] [Test] Test message'),
        'arg1',
        'arg2'
      );
      expect(consoleInfo).not.toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should include timestamp in message', () => {
      const logger = new Logger('Test', { enabled: true, level: 'info' });

      logger.info('Test');

      expect(consoleInfo).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      );
    });

    it('should include log level in message', () => {
      const logger = new Logger('Test', { enabled: true, level: 'debug' });

      logger.debug('Test');
      logger.info('Test');
      logger.warn('Test');
      logger.error('Test');

      expect(consoleDebug).toHaveBeenCalledWith(expect.stringContaining('[DEBUG]'));
      expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
    });

    it('should include context in message', () => {
      const logger = new Logger('MyContext', { enabled: true, level: 'info' });

      logger.info('Test');

      expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[MyContext]'));
    });
  });

  describe('child logger', () => {
    it('should create child logger with extended context', () => {
      const parent = new Logger('Parent', { enabled: true, level: 'info' });
      const child = parent.child('Child');

      child.info('Test message');

      expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[Parent:Child]'));
    });

    it('should inherit parent configuration', () => {
      const customLogger = jest.fn();
      const parent = new Logger('Parent', {
        enabled: true,
        level: 'warn',
        logger: customLogger,
      });
      const child = parent.child('Child');

      child.info('Should not log');
      child.warn('Should log');

      expect(customLogger).toHaveBeenCalledTimes(1);
      expect(customLogger).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('[WARN] [Parent:Child]')
      );
    });

    it('should support multiple levels of nesting', () => {
      const root = new Logger('Root', { enabled: true, level: 'info' });
      const child1 = root.child('Child1');
      const child2 = child1.child('Child2');

      child2.info('Test');

      expect(consoleInfo).toHaveBeenCalledWith(expect.stringContaining('[Root:Child1:Child2]'));
    });
  });

  describe('createLogger', () => {
    it('should create logger with context and config', () => {
      const logger = createLogger('TestContext', { enabled: true, level: 'debug' });

      expect(logger).toBeInstanceOf(Logger);

      logger.debug('Test');

      expect(consoleDebug).toHaveBeenCalledWith(expect.stringContaining('[TestContext]'));
    });
  });

  describe('LogLevel enum', () => {
    it('should have correct numeric values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.NONE).toBe(4);
    });
  });
});
