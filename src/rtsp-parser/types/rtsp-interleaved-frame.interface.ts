/**
 * RTSP TCP interleaved frame with channel, four-byte header, and payload.
 */
export interface RtspInterleavedFrame {
  /** Discriminant or media type used to interpret this value. */
  readonly type: 'interleaved-frame';
  /** RTSP interleaved or audio channel number, as determined by this contract. */
  readonly channel: number;
  /** Media bytes after the RTP or protocol header. */
  readonly payload: Buffer;
  /** Original wire bytes of the RTSP header or interleaved prefix. */
  readonly rawHeader: Buffer;
}
