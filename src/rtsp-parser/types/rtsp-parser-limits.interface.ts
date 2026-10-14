/**
 * Maximum accepted RTSP header, body, and interleaved payload sizes.
 */
export interface RtspParserLimits {
  /** Max header measured in bytes. */
  readonly maxHeaderBytes: number;
  /** Max body measured in bytes. */
  readonly maxBodyBytes: number;
  /** Max interleaved packet measured in bytes. */
  readonly maxInterleavedPacketBytes: number;
}
