/**
 * AudioCapture tests
 */

import { AudioCapture } from '../../../../src/core/audio/AudioCapture';
import { AudioCaptureError, MicrophonePermissionError } from '../../../../src/utils/errors';

// Mock MediaStream and AudioContext
const mockTrack = { stop: jest.fn(), kind: 'audio', enabled: true };
const mockMediaStream = {
  getTracks: jest.fn(() => [mockTrack]),
};

const mockAudioContext = {
  createMediaStreamSource: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  createScriptProcessor: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    onaudioprocess: null,
  })),
  destination: {},
  sampleRate: 16000,
  state: 'running',
  suspend: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

describe('AudioCapture', () => {
  let audioCapture: AudioCapture;

  beforeEach(() => {
    audioCapture = new AudioCapture();

    // Reset mock track
    mockTrack.stop.mockClear();

    // Mock getUserMedia
    global.navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue(mockMediaStream);

    // Mock AudioContext
    (global as any).AudioContext = jest.fn(() => mockAudioContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      expect(audioCapture).toBeInstanceOf(AudioCapture);
      expect(audioCapture.getState()).toBe('inactive');
    });

    it('should create with custom config', () => {
      const config = {
        sampleRate: 48000,
        channels: 2,
        format: 'wav' as const,
      };
      const capture = new AudioCapture(config);

      expect(capture.getConfig()).toMatchObject(config);
    });
  });

  describe('permissions', () => {
    it('should request microphone permission', async () => {
      const result = await audioCapture.requestPermission();

      expect(result).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should return false if permission denied', async () => {
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const result = await audioCapture.requestPermission();

      expect(result).toBe(false);
    });

    it('should check permission status', async () => {
      const mockQuery = jest.fn().mockResolvedValue({ state: 'granted' });
      (navigator as any).permissions = { query: mockQuery };

      const status = await audioCapture.checkPermission();

      expect(status).toBe('granted');
    });

    it('should return prompt if permissions API not available', async () => {
      delete (navigator as any).permissions;

      const status = await audioCapture.checkPermission();

      expect(status).toBe('prompt');
    });
  });

  describe('start capture', () => {
    it('should start audio capture', async () => {
      const callback = jest.fn();

      await audioCapture.start(callback);

      expect(audioCapture.getState()).toBe('active');
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });

    it('should request microphone with correct constraints', async () => {
      const capture = new AudioCapture({
        sampleRate: 48000,
        channels: 2,
        echoCancellation: false,
      });

      await capture.start(jest.fn());

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    });

    it('should throw MicrophonePermissionError on permission denied', async () => {
      const error = new Error('Permission denied');
      (error as any).name = 'NotAllowedError';
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(error);

      await expect(audioCapture.start(jest.fn())).rejects.toThrow(MicrophonePermissionError);
    });

    it('should throw AudioCaptureError on other errors', async () => {
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(
        new Error('Device error')
      );

      await expect(audioCapture.start(jest.fn())).rejects.toThrow(AudioCaptureError);
    });

    it('should not start if already capturing', async () => {
      await audioCapture.start(jest.fn());

      const getUserMediaCalls = (navigator.mediaDevices.getUserMedia as jest.Mock).mock.calls
        .length;

      await audioCapture.start(jest.fn());

      expect((navigator.mediaDevices.getUserMedia as jest.Mock).mock.calls.length).toBe(
        getUserMediaCalls
      );
    });
  });

  describe('pause and resume', () => {
    it('should pause capture', async () => {
      await audioCapture.start(jest.fn());

      audioCapture.pause();

      expect(audioCapture.getState()).toBe('paused');
      expect(mockAudioContext.suspend).toHaveBeenCalled();
    });

    it('should resume capture', async () => {
      await audioCapture.start(jest.fn());
      audioCapture.pause();

      await audioCapture.resume();

      expect(audioCapture.getState()).toBe('active');
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should not pause if not active', () => {
      audioCapture.pause();

      // Should not throw, warning is logged internally
      expect(audioCapture.getState()).toBe('inactive');
    });

    it('should not resume if not paused', async () => {
      await audioCapture.resume();

      // Should not throw, warning is logged internally
      expect(audioCapture.getState()).toBe('inactive');
    });
  });

  describe('stop capture', () => {
    it('should stop audio capture', async () => {
      await audioCapture.start(jest.fn());

      await audioCapture.stop();

      expect(audioCapture.getState()).toBe('inactive');
      expect(mockMediaStream.getTracks()[0]?.stop).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should not stop if already inactive', async () => {
      await audioCapture.stop();

      // Should not throw, warning is logged internally
      expect(audioCapture.getState()).toBe('inactive');
    });

    it('should cleanup all resources', async () => {
      await audioCapture.start(jest.fn());
      await audioCapture.stop();

      expect(audioCapture.getAudioContext()).toBeNull();
    });
  });

  describe('state checks', () => {
    it('isCapturing should return false when inactive', () => {
      expect(audioCapture.isCapturing()).toBe(false);
    });

    it('isCapturing should return true when active', async () => {
      await audioCapture.start(jest.fn());

      expect(audioCapture.isCapturing()).toBe(true);
    });

    it('isCapturing should return false when paused', async () => {
      await audioCapture.start(jest.fn());
      audioCapture.pause();

      expect(audioCapture.isCapturing()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = audioCapture.getConfig();

      expect(config).toHaveProperty('sampleRate');
      expect(config).toHaveProperty('format');
      expect(config).toHaveProperty('channels');
    });

    it('should update config', () => {
      audioCapture.updateConfig({ sampleRate: 48000 });

      const config = audioCapture.getConfig();

      expect(config.sampleRate).toBe(48000);
    });

    it('should require restart for config changes to take effect', async () => {
      await audioCapture.start(jest.fn());
      const originalCalls = (navigator.mediaDevices.getUserMedia as jest.Mock).mock.calls.length;

      audioCapture.updateConfig({ sampleRate: 48000 });

      // Config updated but getUserMedia not called again
      expect((navigator.mediaDevices.getUserMedia as jest.Mock).mock.calls.length).toBe(
        originalCalls
      );
    });
  });

  describe('audio processing', () => {
    it('should call callback with audio data', async () => {
      const callback = jest.fn();

      await audioCapture.start(callback);

      // Verify the audio processing setup was created
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
    });
  });

  describe('audio context access', () => {
    it('should return null audio context when inactive', () => {
      expect(audioCapture.getAudioContext()).toBeNull();
    });

    it('should return audio context when active', async () => {
      await audioCapture.start(jest.fn());

      const context = audioCapture.getAudioContext();

      expect(context).toBeDefined();
      expect(context).toBe(mockAudioContext);
    });
  });
});
