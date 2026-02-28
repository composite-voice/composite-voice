/**
 * Audio-related type definitions for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines the core audio types used throughout the SDK for configuring
 * microphone capture, audio playback, and streaming audio data between providers.
 * These types are consumed by {@link AudioInputConfig} and {@link AudioOutputConfig}
 * in the main SDK configuration, and by providers that handle raw audio data.
 *
 * @packageDocumentation
 */

/**
 * Audio container/codec formats supported by the SDK.
 *
 * @remarks
 * Represents the container or codec format for audio data flowing through the pipeline.
 * The format you choose depends on your STT and TTS providers. For example, Deepgram
 * WebSocket STT expects `'pcm'` (raw linear16), while REST-based TTS providers may
 * return `'mp3'` or `'opus'` encoded audio.
 *
 * - `'pcm'` - Raw PCM (uncompressed, lowest latency, highest bandwidth)
 * - `'opus'` - Opus codec (good compression, low latency, widely supported)
 * - `'mp3'` - MP3 format (universal compatibility, higher latency)
 * - `'wav'` - WAV container (uncompressed PCM with headers)
 * - `'webm'` - WebM container (browser-native, used by MediaRecorder)
 *
 * @see {@link AudioInputConfig} for configuring the capture format
 * @see {@link AudioEncoding} for the related encoding type
 */
export type AudioFormat = 'pcm' | 'opus' | 'mp3' | 'wav' | 'webm';

/**
 * Audio encoding schemes supported by the SDK.
 *
 * @remarks
 * Describes the sample encoding of raw audio data. This is primarily used in
 * {@link AudioMetadata} to communicate the encoding of audio chunks between
 * TTS providers and the audio player.
 *
 * - `'linear16'` - 16-bit signed integer PCM (most common for speech)
 * - `'opus'` - Opus-encoded audio
 * - `'mp3'` - MP3-encoded audio
 * - `'mulaw'` - mu-law companding (telephony standard, North America/Japan)
 * - `'alaw'` - A-law companding (telephony standard, Europe/international)
 *
 * @see {@link AudioMetadata} for where this type is used
 * @see {@link AudioFormat} for the related container format type
 */
export type AudioEncoding = 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw';

/**
 * Configuration for audio input (microphone capture).
 *
 * @remarks
 * Controls how the SDK captures audio from the user's microphone. These settings
 * are passed to the browser's `getUserMedia` API and the internal audio processing
 * pipeline. The configuration affects audio quality, bandwidth, and compatibility
 * with your chosen STT provider.
 *
 * Most STT providers work best with 16kHz mono PCM audio. The SDK applies sensible
 * defaults via {@link DEFAULT_AUDIO_INPUT_CONFIG} if you do not specify these values.
 *
 * @example
 * ```typescript
 * import { CompositeVoice } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   stt: mySTTProvider,
 *   llm: myLLMProvider,
 *   tts: myTTSProvider,
 *   audio: {
 *     input: {
 *       sampleRate: 16000,
 *       format: 'pcm',
 *       channels: 1,
 *       echoCancellation: true,
 *       noiseSuppression: true,
 *     },
 *   },
 * });
 * ```
 *
 * @see {@link AudioOutputConfig} for playback configuration
 * @see {@link CompositeVoiceConfig} for the top-level SDK configuration
 */
export interface AudioInputConfig {
  /**
   * Sample rate in Hz for audio capture.
   *
   * @remarks
   * Common values are 16000 (speech-optimized), 24000, and 48000 (high fidelity).
   * Most STT providers perform best at 16000 Hz.
   */
  sampleRate: number;

  /**
   * Audio format/codec for encoding captured audio.
   *
   * @see {@link AudioFormat}
   */
  format: AudioFormat;

  /**
   * Number of audio channels.
   *
   * @remarks
   * Use 1 for mono (recommended for speech) or 2 for stereo.
   *
   * @defaultValue 1
   */
  channels?: number;

  /**
   * Duration of each audio chunk sent to the STT provider, in milliseconds.
   *
   * @remarks
   * Lower values reduce latency but increase the number of chunks sent.
   * Typical values range from 20ms to 250ms.
   *
   * @defaultValue 100
   */
  chunkDuration?: number;

  /**
   * Whether to enable the browser's echo cancellation processing.
   *
   * @remarks
   * Strongly recommended when using speaker output simultaneously with microphone
   * capture to prevent the TTS audio from being re-transcribed by the STT provider.
   *
   * @defaultValue true
   */
  echoCancellation?: boolean;

  /**
   * Whether to enable the browser's noise suppression processing.
   *
   * @remarks
   * Reduces background noise for cleaner transcriptions. Recommended for most
   * environments unless you need raw audio fidelity.
   *
   * @defaultValue true
   */
  noiseSuppression?: boolean;

  /**
   * Whether to enable the browser's automatic gain control.
   *
   * @remarks
   * Normalizes microphone input volume, which helps when users speak at varying
   * distances from the microphone.
   *
   * @defaultValue true
   */
  autoGainControl?: boolean;
}

/**
 * Configuration for audio output (playback).
 *
 * @remarks
 * Controls how the SDK plays back synthesized audio from TTS providers. These
 * settings affect the AudioContext and buffering behavior used for playback.
 * The SDK applies sensible defaults via {@link DEFAULT_AUDIO_OUTPUT_CONFIG} if
 * you do not specify these values.
 *
 * @example
 * ```typescript
 * import { CompositeVoice } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   stt: mySTTProvider,
 *   llm: myLLMProvider,
 *   tts: myTTSProvider,
 *   audio: {
 *     output: {
 *       bufferSize: 4096,
 *       minBufferDuration: 200,
 *       enableSmoothing: true,
 *     },
 *   },
 * });
 * ```
 *
 * @see {@link AudioInputConfig} for capture configuration
 * @see {@link CompositeVoiceConfig} for the top-level SDK configuration
 */
export interface AudioOutputConfig {
  /**
   * Buffer size for audio playback in samples.
   *
   * @remarks
   * Larger buffers reduce glitches but increase latency. Smaller buffers
   * provide lower latency but may cause audio dropouts on slower devices.
   *
   * @defaultValue 4096
   */
  bufferSize?: number;

  /**
   * Minimum buffer duration before starting playback, in milliseconds.
   *
   * @remarks
   * The audio player waits until this much audio has been buffered before
   * beginning playback. Higher values produce smoother audio at the cost
   * of increased initial latency.
   *
   * @defaultValue 200
   */
  minBufferDuration?: number;

  /**
   * Sample rate for the AudioContext used for playback.
   *
   * @remarks
   * If not specified, the SDK uses the sample rate reported in
   * {@link AudioMetadata} from the TTS provider, or the browser's default.
   */
  sampleRate?: number;

  /**
   * Whether to enable audio smoothing when stitching adjacent chunks.
   *
   * @remarks
   * Applies crossfading between consecutive audio chunks to eliminate
   * clicks and pops at chunk boundaries. Recommended for streaming TTS.
   *
   * @defaultValue true
   */
  enableSmoothing?: boolean;
}

/**
 * Metadata describing the format of audio data received from a provider.
 *
 * @remarks
 * Audio metadata is emitted by TTS providers (via `onMetadata`) to inform the
 * audio player how to decode and play the incoming audio chunks. This is
 * especially important for WebSocket-based TTS providers where the audio format
 * may not be known until the connection is established.
 *
 * @example
 * ```typescript
 * // Listening for audio metadata from a TTS provider
 * ttsProvider.onMetadata((metadata) => {
 *   console.log(`Audio: ${metadata.sampleRate}Hz, ${metadata.encoding}, ${metadata.channels}ch`);
 * });
 * ```
 *
 * @see {@link AudioChunk} for the audio data that accompanies this metadata
 * @see {@link AudioEncoding} for supported encoding values
 */
export interface AudioMetadata {
  /** Sample rate of the audio in Hz (e.g., 16000, 24000, 44100). */
  sampleRate: number;

  /**
   * Encoding format of the audio samples.
   *
   * @see {@link AudioEncoding}
   */
  encoding: AudioEncoding;

  /** Number of audio channels (1 = mono, 2 = stereo). */
  channels: number;

  /**
   * Bit depth of each audio sample.
   *
   * @remarks
   * Common values are 16 (for linear16) and 24 (for high-fidelity audio).
   * May be undefined for compressed formats like opus or mp3.
   */
  bitDepth?: number;

  /**
   * MIME type of the audio data, if available.
   *
   * @remarks
   * Examples: `'audio/pcm'`, `'audio/mpeg'`, `'audio/opus'`.
   * Useful for creating Blob objects from raw audio data.
   */
  mimeType?: string;
}

/**
 * A chunk of audio data flowing through the pipeline.
 *
 * @remarks
 * Audio chunks are the fundamental unit of streaming audio in the SDK. They
 * are emitted by TTS providers and consumed by the audio player. Each chunk
 * contains raw audio bytes along with optional metadata and ordering information.
 *
 * @example
 * ```typescript
 * // Receiving audio chunks from a TTS provider
 * ttsProvider.onAudio((chunk: AudioChunk) => {
 *   console.log(`Received ${chunk.data.byteLength} bytes, seq=${chunk.sequence}`);
 *   audioPlayer.enqueue(chunk);
 * });
 * ```
 *
 * @see {@link AudioMetadata} for the format description of audio data
 * @see {@link TTSAudioEvent} for the event that wraps this type
 */
export interface AudioChunk {
  /** Raw audio data as an ArrayBuffer. */
  data: ArrayBuffer;

  /**
   * Format metadata for this specific chunk.
   *
   * @remarks
   * When present, overrides the global metadata from the provider.
   * Typically omitted when the format is consistent across all chunks.
   *
   * @see {@link AudioMetadata}
   */
  metadata?: AudioMetadata;

  /**
   * Unix timestamp (in milliseconds) of when this chunk was created.
   *
   * @remarks
   * Used for latency tracking and debugging the audio pipeline.
   */
  timestamp: number;

  /**
   * Sequence number for ordering chunks.
   *
   * @remarks
   * Ensures correct playback order when chunks arrive out of sequence,
   * which can occur with WebSocket-based providers under network jitter.
   */
  sequence?: number;
}

/**
 * State of the user's microphone permission in the browser.
 *
 * @remarks
 * Reflects the Permissions API state for the `'microphone'` permission.
 * The SDK checks this before attempting to capture audio.
 *
 * - `'granted'` - The user has allowed microphone access
 * - `'denied'` - The user has blocked microphone access
 * - `'prompt'` - The browser will prompt the user for permission
 *
 * @see {@link AudioCaptureState} for the runtime capture state
 */
export type MicrophonePermissionState = 'granted' | 'denied' | 'prompt';

/**
 * Runtime state of the audio capture pipeline.
 *
 * @remarks
 * Tracks the lifecycle of microphone audio capture within the SDK.
 * State transitions follow this flow:
 *
 * `inactive` -\> `starting` -\> `active` -\> `paused` | `stopping` -\> `inactive`
 *
 * - `'inactive'` - Capture is not running
 * - `'starting'` - Capture is initializing (requesting permissions, setting up AudioContext)
 * - `'active'` - Audio is being captured and sent to the STT provider
 * - `'paused'` - Capture is temporarily paused (e.g., during TTS playback)
 * - `'stopping'` - Capture is shutting down and releasing resources
 *
 * @see {@link MicrophonePermissionState} for permission state
 * @see {@link AudioPlaybackState} for the corresponding playback state
 */
export type AudioCaptureState = 'inactive' | 'starting' | 'active' | 'paused' | 'stopping';

/**
 * Runtime state of the audio playback pipeline.
 *
 * @remarks
 * Tracks the lifecycle of TTS audio playback within the SDK.
 * State transitions follow this flow:
 *
 * `idle` -\> `buffering` -\> `playing` -\> `paused` | `stopped` -\> `idle`
 *
 * - `'idle'` - No audio is queued or playing
 * - `'buffering'` - Audio chunks are being buffered before playback begins
 * - `'playing'` - Audio is actively being played through the speakers
 * - `'paused'` - Playback is temporarily paused
 * - `'stopped'` - Playback has been stopped (queue cleared)
 *
 * @see {@link AudioCaptureState} for the corresponding capture state
 * @see {@link AudioOutputConfig} for playback configuration options
 */
export type AudioPlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'stopped';
