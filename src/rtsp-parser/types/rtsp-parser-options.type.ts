import type { RtspParserLimits } from './rtsp-parser-limits.interface.js';
import type { RtspParserMode } from './rtsp-parser-mode.type.js';
/**
 * Configuration options for rtsp Parser.
 */
export type RtspParserOptions = Partial<RtspParserLimits> & {
  /** Accepted parser input mode: messages, interleaved frames, or both. */
  readonly mode?: RtspParserMode;
};
