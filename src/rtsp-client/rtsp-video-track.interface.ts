







import { type SdpMediaDescription, type SdpRtpMap } from '../rtsp-parser/index.js';

export interface RtspVideoTrack {
  readonly media: SdpMediaDescription;
  readonly rtpMap: SdpRtpMap;
  readonly controlUrl: string;
  readonly rtpChannel: number;
  readonly rtcpChannel: number;
}
