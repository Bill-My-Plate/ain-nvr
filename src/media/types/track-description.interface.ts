import type { H264ParameterSets } from '../../h264/index.js';

/** Negotiated identity, format, and RTSP/TCP channels for one media track. */
export interface TrackDescription {
  /** Logical track identifier used to match packets and recording index entries. */
  readonly trackId: string;
  /** Whether the track carries video or audio. */
  readonly mediaType: 'video' | 'audio';
  /** Codec carried by the track's RTP packets. */
  readonly codec: 'h264' | 'pcmu' | 'pcma';
  /** RTP payload type negotiated for this track. */
  readonly payloadType: number;
  /** RTP timestamp ticks per second for this track. */
  readonly clockRate: number;
  /** RTSP interleaved TCP channel that carries RTP packets. */
  readonly rtpChannel: number;
  /** RTSP interleaved TCP channel that carries RTCP packets. */
  readonly rtcpChannel: number;
  /** Optional H.264 SPS and PPS NAL units obtained from SDP. */
  readonly parameterSets?: H264ParameterSets;
}
