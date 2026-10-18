/**
 * Current status of rtsp Loopback Bridge.
 */
export interface RtspLoopbackBridgeStatus {
  /** Whether the RTSP listener is active. */
  readonly running: boolean;
  /** Number of connected RTSP clients. */
  readonly clientCount: number;
  /** Number of clients that completed PLAY. */
  readonly playingClientCount: number;
  /** Preroll measured in bytes. */
  readonly prerollBytes: number;
  /** Number of packets retained for new clients. */
  readonly prerollPackets: number;
}
