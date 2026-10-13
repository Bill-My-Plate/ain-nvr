import { RTSP_TRANSPORT } from '../constants/rtsp-transport.constant.js';
import { RtspClientError } from '../errors/rtsp-client-error.class.js';

/** Read RTP and RTCP channel numbers from SETUP Transport, falling back to requested channels if omitted. */
export function interleavedChannels(
  transport: string | undefined,
  requestedRtp: number,
  requestedRtcp: number,
): {
  /** One-byte TCP channel selected for RTP packets. */
  rtpChannel: number;
  /** One-byte TCP channel selected for RTCP packets. */
  rtcpChannel: number;
} {
  if (transport !== undefined && /RTP\/AVP(?!\/TCP)/iu.test(transport)) {
    throw new RtspClientError('Camera selected unsupported RTP/UDP transport.');
  }
  // Existing cameras may omit the selected pair; keep the requested one.
  if (transport === undefined || !/interleaved/iu.test(transport)) {
    return { rtpChannel: requestedRtp, rtcpChannel: requestedRtcp };
  }
  const channels = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(transport);
  if (channels === null) {
    throw new RtspClientError('SETUP response has malformed interleaved channels.');
  }
  const rtpChannel = Number(channels[1]);
  const rtcpChannel = Number(channels[2]);
  if (rtpChannel > RTSP_TRANSPORT.maximumChannel || rtcpChannel > RTSP_TRANSPORT.maximumChannel || rtpChannel === rtcpChannel) {
    throw new RtspClientError('SETUP response has invalid interleaved channels.');
  }
  return { rtpChannel, rtcpChannel };
}
