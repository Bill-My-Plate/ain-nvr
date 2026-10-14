import type { OrderedInput } from './ordered-input.type.js';
/**
 * H.264 access unit held until it can be written at a safe boundary.
 */
export type PendingSafeAccessUnit = {
  /** RTP timestamp of the access unit awaiting a safe write boundary. */
  readonly timestamp: number;
  /** Packets produced or retained by this operation. */
  readonly packets: OrderedInput[];
  /** Number of bytes in this payload or queued buffer. */
  bytes: number;
  /** Whether packet loss or malformed fragments made this access unit incomplete. */
  damaged: boolean;
  /** Whether this access unit contains an IDR keyframe. */
  hasIdr: boolean;
  /** NAL type reconstructed from the FU-A fragment header. */
  fuNalType: number | undefined;
};
