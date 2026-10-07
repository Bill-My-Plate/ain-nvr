export interface RtspParserLimits {
  readonly maxHeaderBytes: number;
  readonly maxBodyBytes: number;
  readonly maxInterleavedPacketBytes: number;
}
