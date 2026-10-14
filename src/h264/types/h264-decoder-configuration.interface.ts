/** Decoder settings derived from an SPS/PPS pair. */
export interface H264DecoderConfiguration {
  /** AVC codec identifier built from the SPS profile, constraints, and level. */
  readonly codec: string;
  /** Width in pixels after applying the SPS frame crop. */
  readonly codedWidth: number;
  /** Height in pixels after applying the SPS frame crop. */
  readonly codedHeight: number;
  /** Access units are emitted with Annex-B start codes. */
  readonly bitstreamFormat: 'annexb';
}
