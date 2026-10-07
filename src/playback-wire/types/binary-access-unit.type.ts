export type BinaryAccessUnit = {
  readonly kind: 'video' | 'audio';
  readonly generation: number;
  readonly timestampUs: number;
  readonly wallClockTimeMs: number;
  readonly durationUs: number;
  readonly key: boolean;
  readonly discontinuity: boolean;
  readonly endOfStream: boolean;
  readonly payload: Buffer;
};
