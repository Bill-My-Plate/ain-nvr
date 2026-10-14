/**
 * Configuration options for recorded Rtsp Parser.
 */
export interface RecordedRtspParserOptions {
  /** Maximum packet measured in bytes. */
  readonly maximumPacketBytes?: number;
  /** Maximum RTP packets buffered while waiting for missing sequence numbers. */
  readonly reorderWindowPackets?: number;
}
