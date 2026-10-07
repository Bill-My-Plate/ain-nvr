import type { H264CodecConfiguration } from '../../h264/index.js';

import type { PlaybackRtpInfo } from './playback-rtp-info.type.js';

export type PlaybackRtspServerOptions = {
  readonly configuration: H264CodecConfiguration;
  readonly videoRtpInfo: PlaybackRtpInfo;
  readonly audioRtpInfo?: PlaybackRtpInfo;
  readonly audioSampleRate?: number;
  readonly maximumQueuedBytes?: number;
};
