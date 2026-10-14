import type { H264CodecConfiguration } from '../../h264/index.js';

import type { PlaybackRtpInfo } from './playback-rtp-info.type.js';
/**
 * Configuration options for playback Rtsp Server.
 */
export type PlaybackRtspServerOptions = {
  /** Codec or runtime configuration currently applied. */
  readonly configuration: H264CodecConfiguration;
  /** RTP payload and clock information advertised for the video track. */
  readonly videoRtpInfo: PlaybackRtpInfo;
  /** RTP payload and clock information advertised for the audio track. */
  readonly audioRtpInfo?: PlaybackRtpInfo;
  /** Samples per second for the optional audio track. */
  readonly audioSampleRate?: number;
  /** Maximum queued measured in bytes. */
  readonly maximumQueuedBytes?: number;
};
