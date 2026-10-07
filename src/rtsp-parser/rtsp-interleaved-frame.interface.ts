



export interface RtspInterleavedFrame {
  readonly type: 'interleaved-frame';
  readonly channel: number;
  readonly payload: Buffer;
  readonly rawHeader: Buffer;
}
