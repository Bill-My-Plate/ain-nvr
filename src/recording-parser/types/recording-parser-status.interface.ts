








export interface RecordingParserStatus {
  readonly reorderedPackets: number;
  readonly duplicatePackets: number;
  readonly lostPackets: number;
  readonly discontinuities: number;
}
