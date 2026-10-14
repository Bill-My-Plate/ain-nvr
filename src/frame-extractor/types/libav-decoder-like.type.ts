import type { LibavPacketLike } from './libav-packet-like.type.js';
import type { LibavFrameLike } from './libav-frame-like.type.js';
/**
 * Subset of libav decoder operations needed by frame extraction.
 */
export type LibavDecoderLike = {
  /** Decoder vendor metadata used for capability checks. */
  readonly vendorInfo?: Record<string, unknown>;
  /**
   * Submits an encoded packet to the decoder.
   */
  sendPacket(packet: LibavPacketLike): Promise<boolean>;
  /**
   * Receives the next decoded frame, when available.
   */
  receiveFrame(): Promise<LibavFrameLike | null | undefined>;
  /**
   * Releases the native libav packet, frame, or decoder resource.
   */
  destroy(): void;
};
