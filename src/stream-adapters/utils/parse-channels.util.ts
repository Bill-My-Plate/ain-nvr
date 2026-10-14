import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
/**
 * Reads the negotiated RTP and RTCP channels from an RTSP Transport header.
 */
export function parseChannels(value: string | undefined):
  | {
      /** RTP channel negotiated for this client. */
      readonly rtp: number;
      /** RTCP channel negotiated for this client. */
      readonly rtcp: number;
    }
  | undefined {
  if (value === undefined || !/RTP\/AVP\/TCP/iu.test(value)) return undefined;
  const match = /(?:^|;)\s*interleaved=(\d+)-(\d+)\s*(?:;|$)/iu.exec(value);
  if (match === null) return undefined;
  const rtp = Number(match[1]);
  const rtcp = Number(match[STREAM_ADAPTER_CONSTANTS.rtcpChannelCaptureGroup]);
  if (
    !Number.isInteger(rtp) ||
    !Number.isInteger(rtcp) ||
    rtp < 0 ||
    rtcp < 0 ||
    rtp > STREAM_ADAPTER_CONSTANTS.maximumInterleavedChannel ||
    rtcp > STREAM_ADAPTER_CONSTANTS.maximumInterleavedChannel ||
    rtp === rtcp
  ) {
    return undefined;
  }
  return { rtp, rtcp };
}
