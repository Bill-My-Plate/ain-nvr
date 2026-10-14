import type { TrackDescription } from '../../media/index.js';

import type { MediaPacket } from '../../media/index.js';
/**
 * Live packet subscription contract consumed by the loopback RTSP bridge.
 */
export interface RtspBridgePacketSource {
  /** Track descriptions participating in this session. */
  readonly tracks: readonly TrackDescription[];
  /**
   * Callback invoked for subscribe Media Packets.
   */
  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void;
}
