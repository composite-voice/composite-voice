/**
 * Error classes tests
 */

import {
  CompositeVoiceError,
  ProviderInitializationError,
  ProviderConnectionError,
  AudioCaptureError,
  AudioPlaybackError,
  MicrophonePermissionError,
  ConfigurationError,
  InvalidStateError,
  ProviderResponseError,
  TimeoutError,
  WebSocketError,
} from '../../../src/utils/errors';

describe('Error Classes', () => {
  describe('CompositeVoiceError', () => {
    it('should create error with message and code', () => {
      const error = new CompositeVoiceError('Test error', 'TEST_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.context).toBeUndefined();
    });

    it('should set recoverable flag', () => {
      const error = new CompositeVoiceError('Test error', 'TEST_ERROR', true);

      expect(error.recoverable).toBe(true);
    });

    it('should include context', () => {
      const context = { userId: '123', action: 'test' };
      const error = new CompositeVoiceError('Test error', 'TEST_ERROR', false, context);

      expect(error.context).toEqual(context);
    });

    it('should have proper name', () => {
      const error = new CompositeVoiceError('Test error', 'TEST_ERROR');

      expect(error.name).toBe('CompositeVoiceError');
    });

    it('should capture stack trace', () => {
      const error = new CompositeVoiceError('Test error', 'TEST_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CompositeVoiceError');
    });
  });

  describe('ProviderInitializationError', () => {
    it('should create error with provider name', () => {
      const error = new ProviderInitializationError('TestProvider');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Failed to initialize provider: TestProvider');
      expect(error.code).toBe('PROVIDER_INIT_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('ProviderInitializationError');
    });

    it('should include cause error in context', () => {
      const cause = new Error('Connection failed');
      const error = new ProviderInitializationError('TestProvider', cause);

      expect(error.context).toEqual({
        providerName: 'TestProvider',
        cause,
      });
    });
  });

  describe('ProviderConnectionError', () => {
    it('should create error with provider name', () => {
      const error = new ProviderConnectionError('TestProvider');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Failed to connect to provider: TestProvider');
      expect(error.code).toBe('PROVIDER_CONNECTION_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ProviderConnectionError');
    });

    it('should include cause error', () => {
      const cause = new Error('Network error');
      const error = new ProviderConnectionError('TestProvider', cause);

      expect(error.context?.cause).toBe(cause);
    });
  });

  describe('AudioCaptureError', () => {
    it('should create error with message', () => {
      const error = new AudioCaptureError('Failed to access microphone');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Audio capture error: Failed to access microphone');
      expect(error.code).toBe('AUDIO_CAPTURE_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('AudioCaptureError');
    });

    it('should include cause error', () => {
      const cause = new Error('Permission denied');
      const error = new AudioCaptureError('Failed to access microphone', cause);

      expect(error.context?.cause).toBe(cause);
    });
  });

  describe('AudioPlaybackError', () => {
    it('should create error with message', () => {
      const error = new AudioPlaybackError('Failed to decode audio');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Audio playback error: Failed to decode audio');
      expect(error.code).toBe('AUDIO_PLAYBACK_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('AudioPlaybackError');
    });
  });

  describe('MicrophonePermissionError', () => {
    it('should create error with predefined message', () => {
      const error = new MicrophonePermissionError();

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Microphone permission denied');
      expect(error.code).toBe('MICROPHONE_PERMISSION_DENIED');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('MicrophonePermissionError');
    });
  });

  describe('ConfigurationError', () => {
    it('should create error with message', () => {
      const error = new ConfigurationError('Invalid configuration');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Configuration error: Invalid configuration');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('ConfigurationError');
    });
  });

  describe('InvalidStateError', () => {
    it('should create error with state and action', () => {
      const error = new InvalidStateError('idle', 'start listening');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Cannot perform "start listening" in current state: idle');
      expect(error.code).toBe('INVALID_STATE_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('InvalidStateError');
    });

    it('should include state and action in context', () => {
      const error = new InvalidStateError('idle', 'start listening');

      expect(error.context).toEqual({
        currentState: 'idle',
        attemptedAction: 'start listening',
      });
    });
  });

  describe('ProviderResponseError', () => {
    it('should create error with provider name', () => {
      const error = new ProviderResponseError('OpenAI');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Provider error from OpenAI: Unknown error');
      expect(error.code).toBe('PROVIDER_RESPONSE_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('ProviderResponseError');
    });

    it('should include status code and message', () => {
      const error = new ProviderResponseError('OpenAI', 429, 'Rate limit exceeded');

      expect(error.message).toBe('Provider error from OpenAI: Rate limit exceeded');
      expect(error.context).toEqual({
        providerName: 'OpenAI',
        statusCode: 429,
        message: 'Rate limit exceeded',
      });
    });
  });

  describe('TimeoutError', () => {
    it('should create error with operation and timeout', () => {
      const error = new TimeoutError('connection', 5000);

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('Operation "connection" timed out after 5000ms');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('TimeoutError');
    });

    it('should include operation and timeout in context', () => {
      const error = new TimeoutError('connection', 5000);

      expect(error.context).toEqual({
        operation: 'connection',
        timeoutMs: 5000,
      });
    });
  });

  describe('WebSocketError', () => {
    it('should create error with message', () => {
      const error = new WebSocketError('Connection closed unexpectedly');

      expect(error).toBeInstanceOf(CompositeVoiceError);
      expect(error.message).toBe('WebSocket error: Connection closed unexpectedly');
      expect(error.code).toBe('WEBSOCKET_ERROR');
      expect(error.recoverable).toBe(true);
      expect(error.name).toBe('WebSocketError');
    });

    it('should include error code in context', () => {
      const error = new WebSocketError('Connection closed', 1006);

      expect(error.context).toEqual({ code: 1006 });
    });
  });
});
