import type { H264Packetization } from './h264-packetization.type.js';

/** Structure found in one complete H.264 RTP payload. */
export interface H264PayloadInspection {
  /** Single NAL, STAP-A aggregation, or FU-A fragmentation. */
  readonly packetization: H264Packetization;
  /** NAL types present; for FU-A, the reconstructed NAL type. */
  readonly nalTypes: readonly number[];
  /** Complete NALs for single/STAP-A; empty for FU-A fragments. */
  readonly nalUnits: readonly Buffer[];
  /** A NAL type indicates SPS; a FU-A fragment need not complete it. */
  readonly hasSps: boolean;
  /** A NAL type indicates PPS; a FU-A fragment need not complete it. */
  readonly hasPps: boolean;
  /** A NAL type indicates IDR; a FU-A fragment need not complete it. */
  readonly hasIdr: boolean;
  /** This FU-A fragment starts its NAL unit. */
  readonly fuStart: boolean;
  /** This FU-A fragment ends its NAL unit. */
  readonly fuEnd: boolean;
  /** NAL header rebuilt from the FU indicator and FU header. */
  readonly reconstructedFuHeader?: number;
  /** FU-A bytes after its two-byte header; a view into the RTP payload. */
  readonly fuPayload?: Buffer;
}
