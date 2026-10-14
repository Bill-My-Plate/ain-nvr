import type { TrackCodec } from './track-codec.type.js';
import type { StoredParameterSets } from './stored-parameter-sets.type.js';
import type { StoredWebCodecInfo } from './stored-web-codec-info.type.js';
/**
 * Track description stored with a recording session.
 */
export type SessionTrack = {
  /**
   * Identifier of the negotiated media track.
   */
  trackId: string;
  /** Audio or video kind declared by the SDP media section. */
  mediaType: 'video' | 'audio';
  /** Codec identifier for the media track. */
  codec: TrackCodec;
  /** RTP timestamp ticks per second for this track. */
  clockRate: number;
  /** RTP payload type negotiated for this track. */
  payloadType: number;
  /** RTSP control URI advertised for this media section. */
  control: string;
  /** RTSP interleaved channel carrying RTP packets. */
  rtpChannel: number;
  /** RTSP interleaved channel carrying RTCP packets. */
  rtcpChannel: number;
  /** Codec format parameters advertised by SDP. */
  fmtp?: string;
  /** Decoder codec description saved for browser playback. */
  webCodec?: StoredWebCodecInfo;
  /** Base64-encoded SPS and PPS values stored for SDP and playback. */
  parameterSetsBase64?: StoredParameterSets;
};
