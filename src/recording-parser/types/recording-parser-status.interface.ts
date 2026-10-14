/**
 * Current status of recording Parser.
 */
export interface RecordingParserStatus {
  /** Number of RTP packets received out of order. */
  readonly reorderedPackets: number;
  /** Number of duplicate RTP packets ignored. */
  readonly duplicatePackets: number;
  /** Number of RTP sequence gaps declared lost. */
  readonly lostPackets: number;
  /** Number of detected stream or clock discontinuities. */
  readonly discontinuities: number;
}
