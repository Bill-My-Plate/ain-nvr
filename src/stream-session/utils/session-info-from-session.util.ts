import type { TrackDescription } from '../../media/index.js';

import { createH264CodecConfiguration } from '../../h264/index.js';

import { type RtspClientSession } from '../../rtsp-client/index.js';

import type { RtspSessionTrackInfo } from '../types/rtsp-session-track-info.type.js';
import type { RtspSessionInfo } from '../types/rtsp-session-info.interface.js';
import { parseFmtp } from './parse-fmtp.util.js';
import { H264_PARAMETER_SET_COUNT } from '../constants/h264-parameter-set-count.constant.js';
/** Converts a negotiated client session into the stable track details exposed to subscribers. */
export function sessionInfoFromSession(session: RtspClientSession): RtspSessionInfo {
  const fmtp = session.video.media.fmtp.get(session.video.rtpMap.payloadType);
  let parameterSets: TrackDescription['parameterSets'];
  const encoded = parseFmtp(fmtp).get('sprop-parameter-sets')?.split(',');
  if (encoded !== undefined && encoded.length >= H264_PARAMETER_SET_COUNT) {
    try {
      // SDP contains base64 SPS and PPS NAL units; malformed values are ignored
      // because in-band parameter sets can still configure the decoder.
      const configuration = createH264CodecConfiguration(
        Buffer.from(encoded[0] ?? '', 'base64'),
        Buffer.from(encoded[1] ?? '', 'base64'),
      );
      parameterSets = { sps: configuration.sps, pps: configuration.pps };
    } catch {
      // In-band parameter sets remain authoritative.
    }
  }
  const video: RtspSessionTrackInfo = {
    trackId: 'video',
    mediaType: 'video',
    codec: 'h264',
    payloadType: session.video.rtpMap.payloadType,
    clockRate: session.video.rtpMap.clockRate,
    control: session.video.media.control ?? '',
    rtpChannel: session.video.rtpChannel,
    rtcpChannel: session.video.rtcpChannel,
    ...(fmtp === undefined ? {} : { fmtp }),
    ...(parameterSets === undefined ? {} : { parameterSets }),
  };
  if (session.audio === undefined) return { sdp: session.sdp, tracks: [video] };
  const audioFmtp = session.audio.media.fmtp.get(session.audio.rtpMap.payloadType);
  return { sdp: session.sdp, tracks: [video, {
    trackId: 'audio',
    mediaType: 'audio',
    codec: session.audio.codec,
    payloadType: session.audio.rtpMap.payloadType,
    clockRate: session.audio.rtpMap.clockRate,
    control: session.audio.media.control ?? '',
    rtpChannel: session.audio.rtpChannel,
    rtcpChannel: session.audio.rtcpChannel,
    ...(audioFmtp === undefined ? {} : { fmtp: audioFmtp }),
  }] };
}
