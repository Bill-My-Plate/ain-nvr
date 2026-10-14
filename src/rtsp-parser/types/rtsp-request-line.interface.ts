/**
 * RTSP method, URI, and protocol version from a request start line.
 */
export interface RtspRequestLine {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'request';
  /** RTSP request method such as DESCRIBE or PLAY. */
  readonly method: string;
  /** Target URI named in the RTSP request start line. */
  readonly uri: string;
  /** RTSP protocol version from the start line. */
  readonly version: string;
}
