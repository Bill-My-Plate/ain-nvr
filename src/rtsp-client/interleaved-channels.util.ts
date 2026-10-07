









import { RtspClientError } from './rtsp-client-error.class.js';

export function interleavedChannels(
  transport: string | undefined,
  requestedRtp: number,
  requestedRtcp: number,
): { rtpChannel: number; rtcpChannel: number } {
  if (transport !== undefined && /RTP\/AVP(?!\/TCP)/iu.test(transport)) {
    throw new RtspClientError('Camera selected unsupported RTP/UDP transport.');
  }
  if (transport === undefined || !/interleaved/iu.test(transport)) {
    return { rtpChannel: requestedRtp, rtcpChannel: requestedRtcp };
  }
  const channels = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(transport);
  if (channels === null) {
    throw new RtspClientError('SETUP response has malformed interleaved channels.');
  }
  const rtpChannel = Number(channels[1]);
  const rtcpChannel = Number(channels[2]);
  if (rtpChannel > 255 || rtcpChannel > 255 || rtpChannel === rtcpChannel) {
    throw new RtspClientError('SETUP response has invalid interleaved channels.');
  }
  return { rtpChannel, rtcpChannel };
}
