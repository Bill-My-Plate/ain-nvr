import type { DecoderHostCapabilities } from './decoder-host-capabilities.interface.js';
import type { FrameExtractorState } from './frame-extractor-state.type.js';
import type { FrameJpegQueueOptions } from './frame-jpeg-queue-options.type.js';

/** Inputs and status hooks owned by one RTSP decoding connection. */
export type RtspFrameSessionOptions = FrameJpegQueueOptions & {
  /** RTSP URL opened by this session. */
  readonly url: string;
  /** Signal that cancels the owning extractor. */
  readonly stopSignal: AbortSignal;
  /** Maximum interval without a decoded frame. */
  readonly mediaTimeoutMs: number;
  /** Desired output sampling rate. */
  readonly framesPerSecond: number;
  /** Host capabilities used to order decoder candidates. */
  readonly capabilities: DecoderHostCapabilities;
  /** Wall clock used for capture timestamps. */
  readonly now: () => number;
  /** Monotonic clock used for sampling. */
  readonly monotonicNow: () => bigint;
  /** Reports an active decoder connection. */
  readonly onState: (state: FrameExtractorState) => void;
  /** Records each valid decoded frame. */
  readonly onDecoded: () => void;
};
