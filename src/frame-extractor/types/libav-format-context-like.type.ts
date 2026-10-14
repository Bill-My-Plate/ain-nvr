import type { LibavStreamLike } from './libav-stream-like.type.js';
import type { LibavPacketLike } from './libav-packet-like.type.js';
import type { LibavDecoderLike } from './libav-decoder-like.type.js';
import type { LibavReceivedPacket } from './libav-received-packet.type.js';
import type { LibavReceivedFrame } from './libav-received-frame.type.js';
/**
 * Subset of libav demuxing operations used to read and decode RTSP video.
 */
export type LibavFormatContextLike = {
  /** Demuxed media streams available in this input. */
  readonly streams: readonly LibavStreamLike[];
  /**
   * Opens the media source and prepares demuxing.
   */
  open(input: string, options?: Record<string, string>): Promise<void>;
  /**
   * Creates a decoder for the selected media stream.
   */
  createDecoder(
    streamIndex: number,
    hardwareDevice?: string,
    decoder?: string,
    deviceName?: string,
  ): LibavDecoderLike;
  /**
   * Reads the next encoded packet from the demuxer.
   */
  readFrame(): Promise<LibavPacketLike | null | undefined>;
  /**
   * Receives the next decoded frame, when available.
   */
  receiveFrame(
    pipelines: readonly [
      {
        /** Index of the selected libav media stream. */
        readonly streamIndex: number;

        /** Decoder used for the selected libav stream. */
        readonly decoder: LibavDecoderLike;
      },
    ],
  ): Promise<LibavReceivedFrame | LibavReceivedPacket | null | undefined>;
  /**
   * Closes this resource and releases owned handles.
   */
  close(): Promise<void>;
};
