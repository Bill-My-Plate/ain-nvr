/**
 * Decoded signed 16-bit PCM samples with playback timing.
 */
export interface PcmAudioAccessUnit {
  /** Discriminant identifying this command, event, or message variant. */
  readonly kind: 'audio';
  /** Media timestamp in microseconds. */
  readonly timestampUs: number;
  /** Corresponding Unix wall-clock time in milliseconds. */
  readonly wallClockTimeMs: number;
  /** Duration in microseconds. */
  readonly durationUs: number;
  /** Sample representation of the decoded PCM bytes. */
  readonly sampleFormat: 's16le';
  /** PCM samples per second. */
  readonly sampleRate: number;
  /** Number of PCM audio channels. */
  readonly channels: 1;
  /** Signed 16-bit little-endian PCM sample bytes. */
  readonly data: Buffer;
}
