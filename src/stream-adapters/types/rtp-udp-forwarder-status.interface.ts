/**
 * Current status of rtp Udp Forwarder.
 */
export interface RtpUdpForwarderStatus {
  /** Number of RTP packets waiting in the UDP forwarder queue. */
  readonly pendingPackets: number;
}
