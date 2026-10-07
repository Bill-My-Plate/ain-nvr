import type { LibavStreamLike } from './libav-stream-like.type.js';
import type { LibavPacketLike } from './libav-packet-like.type.js';
import type { LibavDecoderLike } from './libav-decoder-like.type.js';
import type { LibavReceivedPacket } from './libav-received-packet.type.js';
import type { LibavReceivedFrame } from './libav-received-frame.type.js';

export type LibavFormatContextLike = {
  readonly streams: readonly LibavStreamLike[];
  open(input: string, options?: Record<string, string>): Promise<void>;
  createDecoder(
    streamIndex: number,
    hardwareDevice?: string,
    decoder?: string,
    deviceName?: string,
  ): LibavDecoderLike;
  readFrame(): Promise<LibavPacketLike | null | undefined>;
  receiveFrame(pipelines: readonly [{
    readonly streamIndex: number;
    readonly decoder: LibavDecoderLike;
  }]): Promise<LibavReceivedFrame | LibavReceivedPacket | null | undefined>;
  close(): Promise<void>;
};
