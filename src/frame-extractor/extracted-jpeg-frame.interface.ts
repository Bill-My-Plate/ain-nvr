





export interface ExtractedJpegFrame {
  readonly data: Buffer;
  readonly frameNumber: number;
  readonly captureTimeMs: number;
  readonly width: number;
  readonly height: number;
  readonly decoder: string;
}
