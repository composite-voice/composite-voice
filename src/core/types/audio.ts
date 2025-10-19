/**
 * Audio-related type definitions
 */

/**
 * Audio format types supported by the SDK
 */
export type AudioFormat = 'pcm' | 'opus' | 'mp3' | 'wav' | 'webm';

/**
 * Audio encoding types
 */
export type AudioEncoding = 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw';

/**
 * Audio input configuration
 */
export interface AudioInputConfig {
  /** Sample rate in Hz (e.g., 16000, 24000, 48000) */
  sampleRate: number;
  /** Audio format for encoding */
  format: AudioFormat;
  /** Number of audio channels (1 = mono, 2 = stereo) */
  channels?: number;
  /** Chunk size for streaming in milliseconds */
  chunkDuration?: number;
  /** Enable echo cancellation */
  echoCancellation?: boolean;
  /** Enable noise suppression */
  noiseSuppression?: boolean;
  /** Enable automatic gain control */
  autoGainControl?: boolean;
}

/**
 * Audio output configuration
 */
export interface AudioOutputConfig {
  /** Buffer size for audio playback */
  bufferSize?: number;
  /** Minimum buffer duration before starting playback (ms) */
  minBufferDuration?: number;
  /** Audio context sample rate */
  sampleRate?: number;
  /** Enable audio smoothing for chunk stitching */
  enableSmoothing?: boolean;
}

/**
 * Audio metadata received from providers
 */
export interface AudioMetadata {
  /** Sample rate of the audio */
  sampleRate: number;
  /** Audio encoding format */
  encoding: AudioEncoding;
  /** Number of channels */
  channels: number;
  /** Bit depth (e.g., 16, 24) */
  bitDepth?: number;
  /** MIME type if available */
  mimeType?: string;
}

/**
 * Audio chunk data
 */
export interface AudioChunk {
  /** Raw audio data */
  data: ArrayBuffer;
  /** Metadata for this chunk */
  metadata?: AudioMetadata;
  /** Timestamp of when this chunk was created */
  timestamp: number;
  /** Sequence number for ordering */
  sequence?: number;
}

/**
 * Microphone permissions state
 */
export type MicrophonePermissionState = 'granted' | 'denied' | 'prompt';

/**
 * Audio capture state
 */
export type AudioCaptureState = 'inactive' | 'starting' | 'active' | 'paused' | 'stopping';

/**
 * Audio playback state
 */
export type AudioPlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'stopped';
