import type { RtpHeaderExtension } from './rtp-header-extension.type.js';

export interface RtpPacket {
  readonly marker: boolean;
  readonly payloadType: number;
  readonly sequenceNumber: number;
  readonly timestamp: number;
  readonly ssrc: number;
  readonly csrc: readonly number[];
  readonly extension?: RtpHeaderExtension;
  readonly paddingBytes: number;
  readonly headerLength: number;
  readonly payload: Buffer;
  readonly raw: Buffer;
}
