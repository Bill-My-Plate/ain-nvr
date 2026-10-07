import type { SdpRtpMap } from './sdp-rtp-map.interface.js';

export type MutableMedia = {
  mediaType: string;
  port: number;
  protocol: string;
  payloadTypes: number[];
  control?: string;
  rtpMaps: Map<number, SdpRtpMap>;
  fmtp: Map<number, string>;
  attributes: Map<string, string[]>;
};
