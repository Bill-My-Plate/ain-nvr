


export interface RtpUdpForwarderStatus {
  readonly forwardedPackets: number;
  readonly droppedPackets: number;
  readonly pendingPackets: number;
}
