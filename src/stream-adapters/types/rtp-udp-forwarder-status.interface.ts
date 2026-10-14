/**
 * Current status of rtp Udp Forwarder.
 */
export interface RtpUdpForwarderStatus {
  /** Number of RTP packets sent to the destination. */
  readonly forwardedPackets: number;
  /** Number of packets discarded because forwarding could not keep up. */
  readonly droppedPackets: number;
  /** Number of RTP packets waiting in the UDP forwarder queue. */
  readonly pendingPackets: number;
}
