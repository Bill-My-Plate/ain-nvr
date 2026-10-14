import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
/**
 * Reads the interleaved RTP/RTCP channel pair from RTSP Transport.
 */
export function parseInterleavedChannels(transport: string | undefined):
  | {
      /** Interleaved RTP channel number. */
      readonly rtpChannel: number;

      /** Interleaved RTCP channel number. */
      readonly rtcpChannel: number;
    }
  | undefined {
  if (transport === undefined || !/RTP\/AVP\/TCP/iu.test(transport)) return undefined;
  const match = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(transport);
  if (match === null) return undefined;
  const rtpChannel = Number(match[1]);
  const rtcpChannel = Number(match[STREAM_ADAPTER_CONSTANTS.rtcpChannelCaptureGroup]);
  if (
    !Number.isInteger(rtpChannel) ||
    !Number.isInteger(rtcpChannel) ||
    rtpChannel < 0 ||
    rtcpChannel < 0 ||
    rtpChannel > STREAM_ADAPTER_CONSTANTS.maximumInterleavedChannel ||
    rtcpChannel > STREAM_ADAPTER_CONSTANTS.maximumInterleavedChannel ||
    rtpChannel === rtcpChannel
  )
    return undefined;
  return { rtpChannel, rtcpChannel };
}
