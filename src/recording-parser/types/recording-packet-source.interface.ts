import type { MediaPacket } from '../../media/index.js';
/**
 * Live media subscription with pause and resume controls.
 */
export interface RecordingPacketSource {
  /**
   * Callback invoked for subscribe Media Packets.
   */
  subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void;
  /**
   * Pauses upstream media delivery when the recording queue is full.
   */
  pauseMedia(): void;
  /**
   * Resumes upstream media delivery after queued work drains.
   */
  resumeMedia(): void;
}
