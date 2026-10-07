import type { SdpRtpMap } from './sdp-rtp-map.interface.js';

export interface SdpMediaDescription {
  readonly mediaType: string;
  readonly port: number;
  readonly protocol: string;
  readonly payloadTypes: readonly number[];
  readonly control?: string;
  readonly rtpMaps: ReadonlyMap<number, SdpRtpMap>;
  readonly fmtp: ReadonlyMap<number, string>;
  readonly attributes: ReadonlyMap<string, readonly string[]>;
}
