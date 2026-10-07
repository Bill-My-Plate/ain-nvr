import type { MediaPacket } from '../media/index.js';


export interface RecordingPacketSource {
  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void;
  pauseMedia(): void;
  resumeMedia(): void;
}
