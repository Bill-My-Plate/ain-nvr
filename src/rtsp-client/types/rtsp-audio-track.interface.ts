







import { type SdpMediaDescription, type SdpRtpMap } from '../../rtsp-parser/index.js';

export interface RtspAudioTrack {
  readonly codec: 'pcmu' | 'pcma';
  readonly media: SdpMediaDescription;
  readonly rtpMap: SdpRtpMap;
  readonly controlUrl: string;
  readonly rtpChannel: number;
  readonly rtcpChannel: number;
}
