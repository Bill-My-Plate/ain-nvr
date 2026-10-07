


import type { TrackDescription } from '../media/index.js';



import type { MediaPacket } from '../media/index.js';

export interface RtspBridgePacketSource {
  readonly tracks: readonly TrackDescription[];
  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void;
}
