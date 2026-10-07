





export interface RecordedByteSource {
  readonly id: string;
  readonly safeLength: number;
  read(offset: number, length: number, signal?: AbortSignal): Promise<Buffer>;
}
