import type { RtspRequestLine } from './rtsp-request-line.interface.js';
import type { RtspResponseLine } from './rtsp-response-line.interface.js';
/**
 * Either a parsed RTSP request line or response line.
 */
export type RtspStartLine = RtspRequestLine | RtspResponseLine;
