/** Requested TCP channels, their one-byte limit, and SETUP transport values. */
export const RTSP_TRANSPORT = {
  videoRtpChannel: 0,
  videoRtcpChannel: 1,
  audioRtpChannel: 2,
  audioRtcpChannel: 3,
  maximumChannel: 255,
  videoHeader: 'RTP/AVP/TCP;unicast;interleaved=0-1',
  audioHeader: 'RTP/AVP/TCP;unicast;interleaved=2-3',
} as const;
