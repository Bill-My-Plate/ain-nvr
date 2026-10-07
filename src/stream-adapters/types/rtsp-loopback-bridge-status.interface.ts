








export interface RtspLoopbackBridgeStatus {
  readonly running: boolean;
  readonly clientCount: number;
  readonly playingClientCount: number;
  readonly prerollBytes: number;
  readonly prerollPackets: number;
  readonly forwardedPackets: number;
  readonly droppedClients: number;
}
