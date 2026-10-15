import type { H264CodecConfiguration } from '../../h264/index.js';
import type { TrackDescription } from '../../media/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';

/** Builds SDP for the current H.264 track, including known parameter sets. */
export function createLoopbackSdp(
  track: TrackDescription,
  configuration: H264CodecConfiguration | undefined,
): string {
  const fmtp =
    configuration === undefined
      ? 'packetization-mode=1'
      : `packetization-mode=1;profile-level-id=${configuration.decoder.codec.slice(STREAM_ADAPTER_CONSTANTS.h264CodecPrefixLength)};` +
        `sprop-parameter-sets=${configuration.sps.toString('base64')},` +
        configuration.pps.toString('base64');
  return [
    'v=0',
    `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
    's=ain-nvr loopback bridge',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    'a=control:*',
    'a=range:npt=0-',
    `m=video 0 RTP/AVP ${track.payloadType}`,
    `a=rtpmap:${track.payloadType} H264/${track.clockRate}`,
    `a=fmtp:${track.payloadType} ${fmtp}`,
    'a=control:trackID=0',
    'a=sendonly',
    '',
  ].join('\r\n');
}
