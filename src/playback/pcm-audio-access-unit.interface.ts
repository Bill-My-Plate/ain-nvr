

export interface PcmAudioAccessUnit {
  readonly kind: 'audio';
  readonly timestampUs: number;
  readonly wallClockTimeMs: number;
  readonly durationUs: number;
  readonly sampleFormat: 's16le';
  readonly sampleRate: number;
  readonly channels: 1;
  readonly data: Buffer;
}
