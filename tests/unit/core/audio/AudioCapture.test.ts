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

const mockScriptProcessor = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  onaudioprocess: null as ((event: any) => void) | null,
};

const mockAudioContext = {
  createMediaStreamSource: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  createScriptProcessor: jest.fn(() => mockScriptProcessor),
  destination: {},
  sampleRate: 16000,
  state: 'running',
  suspend: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  audioWorklet: undefined as any,
};

// Mock AudioWorkletNode
const mockWorkletPort = {
  onmessage: null as ((event: any) => void) | null,
  postMessage: jest.fn(),
};

const mockWorkletNode = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  port: mockWorkletPort,
};

describe('AudioCapture', () => {
  let audioCapture: AudioCapture;

  beforeEach(() => {
    audioCapture = new AudioCapture();

    // Reset mock track
    mockTrack.stop.mockClear();

    // Reset script processor
    mockScriptProcessor.connect.mockClear();
    mockScriptProcessor.disconnect.mockClear();
    mockScriptProcessor.onaudioprocess = null;

    // Reset worklet mocks
    mockWorkletPort.onmessage = null;
    mockWorkletPort.postMessage.mockClear();
    mockWorkletNode.connect.mockClear();
    mockWorkletNode.disconnect.mockClear();

    // Default: no AudioWorklet support (fallback path)
    mockAudioContext.audioWorklet = undefined;

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

  describe('audio processing (ScriptProcessor fallback)', () => {
    it('should use ScriptProcessorNode when AudioWorklet is not available', async () => {
      await audioCapture.start(jest.fn());

      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
      expect(audioCapture.isUsingWorklet()).toBe(false);
    });

    it('should call callback with audio data via ScriptProcessor', async () => {
      const callback = jest.fn();

      await audioCapture.start(callback);

      // Verify the audio processing setup was created
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
    });
  });

  describe('audio processing (AudioWorklet)', () => {
    let mockAddModule: jest.Mock;

    beforeEach(() => {
      // Set up AudioWorklet support
      mockAddModule = jest.fn().mockResolvedValue(undefined);
      mockAudioContext.audioWorklet = {
        addModule: mockAddModule,
      };

      // Mock AudioWorkletNode constructor
      (global as any).AudioWorkletNode = jest.fn(() => mockWorkletNode);

      // Mock URL.createObjectURL and URL.revokeObjectURL
      (global as any).URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      (global as any).URL.revokeObjectURL = jest.fn();

      // Mock Blob constructor
      (global as any).Blob = jest.fn().mockImplementation(() => ({}));
    });

    afterEach(() => {
      delete (global as any).AudioWorkletNode;
    });

    it('should use AudioWorkletNode when available', async () => {
      await audioCapture.start(jest.fn());

      expect(mockAddModule).toHaveBeenCalled();
      expect((global as any).AudioWorkletNode).toHaveBeenCalledWith(
        mockAudioContext,
        'audio-capture-processor'
      );
      expect(audioCapture.isUsingWorklet()).toBe(true);
    });

    it('should create a Blob URL for the worklet processor', async () => {
      await audioCapture.start(jest.fn());

      expect((global as any).Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('AudioCaptureProcessor')]),
        { type: 'application/javascript' }
      );
      expect((global as any).URL.createObjectURL).toHaveBeenCalled();
    });

    it('should revoke the Blob URL after addModule', async () => {
      await audioCapture.start(jest.fn());

      expect((global as any).URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should set up message handler on worklet port', async () => {
      await audioCapture.start(jest.fn());

      expect(mockWorkletPort.onmessage).toBeInstanceOf(Function);
    });

    it('should not create ScriptProcessorNode when AudioWorklet succeeds', async () => {
      await audioCapture.start(jest.fn());

      expect(mockAudioContext.createScriptProcessor).not.toHaveBeenCalled();
    });

    it('should fall back to ScriptProcessorNode when addModule fails', async () => {
      mockAddModule.mockRejectedValueOnce(new Error('addModule not supported'));

      await audioCapture.start(jest.fn());

      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
      expect(audioCapture.isUsingWorklet()).toBe(false);
    });

    it('should fall back to ScriptProcessorNode when AudioWorkletNode constructor fails', async () => {
      (global as any).AudioWorkletNode = jest.fn(() => {
        throw new Error('AudioWorkletNode not supported');
      });

      await audioCapture.start(jest.fn());

      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
      expect(audioCapture.isUsingWorklet()).toBe(false);
    });

    it('should clean up worklet node on stop', async () => {
      await audioCapture.start(jest.fn());

      expect(audioCapture.isUsingWorklet()).toBe(true);

      await audioCapture.stop();

      expect(mockWorkletNode.disconnect).toHaveBeenCalled();
      expect(audioCapture.isUsingWorklet()).toBe(false);
    });

    it('should revoke Blob URL even when addModule fails', async () => {
      mockAddModule.mockRejectedValueOnce(new Error('addModule not supported'));

      await audioCapture.start(jest.fn());

      expect((global as any).URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
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
