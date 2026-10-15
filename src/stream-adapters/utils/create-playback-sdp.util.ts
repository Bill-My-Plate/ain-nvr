import type { H264CodecConfiguration } from '../../h264/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';

/** Builds the SDP body advertised by the local playback RTSP server. */
export function createPlaybackSdp(
  configuration: H264CodecConfiguration,
  audioSampleRate?: number,
): string {
  const lines = [
    'v=0',
    `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
    's=ain-nvr playback bridge',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    'a=control:*',
    'a=range:npt=0-',
    `m=video 0 RTP/AVP ${STREAM_ADAPTER_CONSTANTS.videoPayloadType}`,
    `a=rtpmap:${STREAM_ADAPTER_CONSTANTS.videoPayloadType} H264/${STREAM_ADAPTER_CONSTANTS.videoClockRate}`,
    `a=fmtp:${STREAM_ADAPTER_CONSTANTS.videoPayloadType} packetization-mode=1;profile-level-id=${configuration.decoder.codec.slice(STREAM_ADAPTER_CONSTANTS.h264CodecPrefixLength)};sprop-parameter-sets=${configuration.sps.toString('base64')},${configuration.pps.toString('base64')}`,
    'a=control:trackID=0',
    'a=sendonly',
  ];
  if (audioSampleRate !== undefined) {
    lines.push(
      `m=audio 0 RTP/AVP ${STREAM_ADAPTER_CONSTANTS.audioPayloadType}`,
      `a=rtpmap:${STREAM_ADAPTER_CONSTANTS.audioPayloadType} L16/${audioSampleRate}/1`,
      'a=control:trackID=1',
      'a=sendonly',
    );
  }
  lines.push('');
  return lines.join('\r\n');
}
