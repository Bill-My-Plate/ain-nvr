import type { RtpHeaderExtension } from "./rtp-header-extension.type.js";

export interface RtpPacket {
  /** Marker bit; its meaning depends on the payload format (for H.264, the end of an access unit). */
  readonly marker: boolean;
  /** Seven-bit payload identifier; dynamic values are mapped to codecs by SDP. */
  readonly payloadType: number;
  /** Unsigned 16-bit packet order number, wrapping from 65535 to 0. */
  readonly sequenceNumber: number;
  /** Unsigned 32-bit timestamp in the track's RTP clock rate, not wall-clock time. */
  readonly timestamp: number;
  /** 32-bit synchronization source identifier for the sending RTP stream. */
  readonly ssrc: number;
  /** Contributing source identifiers from an RTP mixer; empty when absent. */
  readonly csrc: readonly number[];
  /** Optional header extension profile and its unprocessed data. */
  readonly extension?: RtpHeaderExtension;
  /** Trailing padding length, including its final count byte; zero when absent. */
  readonly paddingBytes: number;
  /** Byte offset where the payload starts, after the fixed header, CSRCs, and extension. */
  readonly headerLength: number;
  /** Encoded media bytes without header or padding; a view into `raw`. */
  readonly payload: Buffer;
  /** Complete original RTP packet, including header, payload, and any padding. */
  readonly raw: Buffer;
}
