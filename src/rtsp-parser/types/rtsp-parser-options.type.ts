import type { RtspParserLimits } from './rtsp-parser-limits.interface.js';
import type { RtspParserMode } from './rtsp-parser-mode.type.js';

export type RtspParserOptions = Partial<RtspParserLimits> & {
  readonly mode?: RtspParserMode;
};
