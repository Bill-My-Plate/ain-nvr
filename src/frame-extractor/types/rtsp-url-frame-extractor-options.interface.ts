import type { Logger } from '../../shared/index.js';

import { type DecoderHostCapabilities } from './decoder-host-capabilities.interface.js';

import type { LibavRuntime } from './libav-runtime.type.js';

import type { ExtractedJpegFrame } from './extracted-jpeg-frame.interface.js';

export interface RtspUrlFrameExtractorOptions {
  readonly id: string;
  readonly url: string;
  readonly runtime: LibavRuntime;
  readonly onFrame: (frame: ExtractedJpegFrame) => Promise<void> | void;
  readonly onError?: (error: Error) => void;
  readonly logger?: Logger;
  readonly framesPerSecond?: number;
  readonly jpegQuality?: number;
  readonly mediaTimeoutMs?: number;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly capabilities?: DecoderHostCapabilities;
  readonly now?: () => number;
  readonly monotonicNow?: () => bigint;
}
