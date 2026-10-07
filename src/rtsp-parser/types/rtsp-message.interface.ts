



import type { RtspStartLine } from './rtsp-start-line.type.js';

export interface RtspMessage {
  readonly type: 'rtsp-message';
  readonly startLine: RtspStartLine;
  readonly headers: ReadonlyMap<string, string>;
  readonly body: Buffer;
  readonly rawHeader: Buffer;
}
