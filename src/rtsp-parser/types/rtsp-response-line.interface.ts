/**
 * Protocol version, status code, and reason from a response start line.
 */
export interface RtspResponseLine {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'response';
  /** RTSP protocol version from the start line. */
  readonly version: string;
  /** RTSP response status code. */
  readonly statusCode: number;
  /** Reason phrase from the RTSP response start line. */
  readonly statusMessage: string;
}
