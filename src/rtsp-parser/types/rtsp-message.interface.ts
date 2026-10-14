import type { RtspStartLine } from './rtsp-start-line.type.js';
import type { RtspHeaders } from '../services/rtsp-headers.class.js';
/**
 * Parsed RTSP start line, headers, optional body, and raw header bytes.
 */
export interface RtspMessage {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'rtsp-message';
  /** Parsed request or response line at the start of the RTSP message. */
  readonly startLine: RtspStartLine;
  /** Case-insensitive RTSP headers parsed from the message. */
  readonly headers: RtspHeaders;
  /** RTSP message body after the header terminator. */
  readonly body: Buffer;
  /** Original wire bytes of the RTSP header or interleaved prefix. */
  readonly rawHeader: Buffer;
}
