/** SPS fields extracted by the limited SPS parser. */
export interface H264SpsInfo {
  /** H.264 profile identifier from the SPS header. */
  readonly profileIdc: number;
  /** Constraint and reserved bits from the SPS header byte. */
  readonly constraintFlags: number;
  /** H.264 level identifier from the SPS header. */
  readonly levelIdc: number;
  /** AVC codec identifier built from the three SPS header bytes. */
  readonly codec: string;
  /** Width in pixels after applying the SPS frame crop. */
  readonly codedWidth: number;
  /** Height in pixels after applying the SPS frame crop. */
  readonly codedHeight: number;
}
