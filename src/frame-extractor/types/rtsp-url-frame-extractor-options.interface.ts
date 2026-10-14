import { type DecoderHostCapabilities } from './decoder-host-capabilities.interface.js';

import type { LibavRuntime } from './libav-runtime.type.js';

import type { ExtractedJpegFrame } from './extracted-jpeg-frame.interface.js';
/**
 * Configuration options for rtsp Url Frame Extractor.
 */
export interface RtspUrlFrameExtractorOptions {
  /** Identifier used to match this request, resource, or response. */
  readonly id: string;
  /** RTSP URL used to reach the stream or playback server. */
  readonly url: string;
  /** libav runtime used to open, decode, and encode frames. */
  readonly runtime: LibavRuntime;
  /** Callback invoked for each accepted decoded frame. */
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  /** Callback invoked when the operation fails. */
  readonly onError?: (error: Error) => void;
  /** Maximum number of output frames sampled per second. */
  readonly framesPerSecond?: number;
  /** JPEG encoder quality used for extracted frames. */
  readonly jpegQuality?: number;
  /** Media timeout in milliseconds. */
  readonly mediaTimeoutMs?: number;
  /** Reconnect initial in milliseconds. */
  readonly reconnectInitialMs?: number;
  /** Reconnect maximum in milliseconds. */
  readonly reconnectMaximumMs?: number;
  /** Host decoder capabilities used to order decoder candidates. */
  readonly capabilities?: DecoderHostCapabilities;
  /** Wall-clock provider used for frame capture times. */
  readonly now?: () => number;
  /** Monotonic clock provider used for frame sampling. */
  readonly monotonicNow?: () => bigint;
}
