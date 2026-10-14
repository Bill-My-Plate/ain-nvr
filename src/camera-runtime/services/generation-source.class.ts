import { CAMERA_RUNTIME_CONSTANTS } from '../constants/camera-runtime-numeric-values.constant.js';
import type { RecordingPacketSource } from '../../recording-parser/index.js';
import type { MediaPacket, RtspStreamSession } from '../../stream-session/index.js';
/** Subscribed synchronously at negotiation, before async writer setup or queued PLAY packets. */
export class GenerationSource implements RecordingPacketSource {
  private queue: MediaPacket[] = [];
  private bytes = 0;
  private subscriber: ((packet: MediaPacket) => void) | undefined;
  private readonly unsubscribe: () => void;
  private paused = false;
  private firstVideo = true;
  private closed = false;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(
    session: RtspStreamSession,
    generation: number,
    onError: (error: Error) => void,
  ) {
    this.session = session;
    this.unsubscribe = session.subscribeMediaPackets((packet) => {
      if (this.closed || packet.sessionGeneration !== generation) return;
      if (this.firstVideo && packet.track?.mediaType === 'video' && packet.rtp !== undefined) {
        this.firstVideo = false;
        packet = { ...packet, discontinuity: true };
      }
      if (this.subscriber !== undefined) this.subscriber(packet);
      else {
        this.bytes += packet.rawInterleavedFrame.length;
        if (
          this.bytes > CAMERA_RUNTIME_CONSTANTS.maxQueuedMediaBytes ||
          this.queue.length >= CAMERA_RUNTIME_CONSTANTS.maxQueuedMediaPackets
        ) {
          this.close();
          onError(new Error('Recording generation startup buffer exceeded its limit.'));
          return;
        }
        this.queue.push(packet);
        if (this.bytes >= CAMERA_RUNTIME_CONSTANTS.pauseQueuedMediaBytes) this.pauseMedia();
      }
    });
  }
  private readonly session: RtspStreamSession;
  /**
   * Subscribes to media Packets.
   */
  public subscribeMediaPackets(subscriber: (packet: MediaPacket) => void): () => void {
    if (this.closed) throw new Error('Recording generation source is closed.');
    this.subscriber = subscriber;
    // Pipeline.start must finish assigning its unsubscribe before delivering buffered packets.
    queueMicrotask(() => {
      const queued = this.queue;
      this.queue = [];
      this.bytes = 0;
      this.resumeMedia();
      for (const packet of queued) {
        if (this.closed || this.subscriber !== subscriber) break;
        subscriber(packet);
      }
    });
    return () => {
      this.subscriber = undefined;
      this.close();
    };
  }
  /**
   * Pause Media.
   */
  public pauseMedia(): void {
    if (this.closed || this.paused) return;
    this.paused = true;
    this.session.pauseMedia();
  }
  /**
   * Resume Media.
   */
  public resumeMedia(): void {
    if (!this.paused) return;
    this.paused = false;
    this.session.resumeMedia();
  }
  /**
   * Stops active work and releases owned resources.
   */
  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.queue = [];
    this.bytes = 0;
    this.resumeMedia();
  }
}
