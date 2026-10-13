

import type { RtpPacket } from '../../rtp-parser/index.js';


/** One parsed, ordered video RTP packet and its caller-supplied context. */
export type H264PacketInput = {
  /** Parsed RTP header and H.264 payload. */
  readonly rtp: RtpPacket;
  /** Packet arrival or recorded wall-clock time in Unix milliseconds. */
  readonly wallClockTimeMs: number;
  /** Signals a stream break; the assembler discards its pending unit. */
  readonly discontinuity?: boolean;
  /** Number of RTP packets declared lost immediately before this packet. */
  readonly lostBefore?: number;
};
