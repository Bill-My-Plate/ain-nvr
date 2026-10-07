



import type { RtspRequestLine } from './rtsp-request-line.interface.js';
import type { RtspResponseLine } from './rtsp-response-line.interface.js';

export type RtspStartLine = RtspRequestLine | RtspResponseLine;
