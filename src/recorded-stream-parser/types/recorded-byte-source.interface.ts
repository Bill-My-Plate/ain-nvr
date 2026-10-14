/**
 * Bounded random-access reader for committed recording bytes.
 */
export interface RecordedByteSource {
  /** Identifier used to match this request, resource, or response. */
  readonly id: string;
  /** Number of committed bytes safe for the parser to read. */
  readonly safeLength: number;
  /**
   * Reads bytes from a stored segment at the requested offset.
   */
  read(offset: number, length: number, signal?: AbortSignal): Promise<Buffer>;
}
