



import type { RtspStartLine } from './rtsp-start-line.type.js';

export type ParsedHeader = {
  readonly startLine: RtspStartLine;
  readonly headers: ReadonlyMap<string, string>;
  readonly contentLength: number;
};
