

import type { RtpPacket } from '../rtp-parser/index.js';


export type H264PacketInput = {
  readonly rtp: RtpPacket;
  readonly wallClockTimeMs: number;
  readonly discontinuity?: boolean;
  readonly lostBefore?: number;
};
