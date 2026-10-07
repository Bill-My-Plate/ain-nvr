



import { AinNvrError } from '../../shared/index.js';

import type { RecordedByteSource } from '../types/recorded-byte-source.interface.js';
import { RecordedStreamError } from '../errors/recorded-stream-error.class.js';

export async function readExactly(
  source: RecordedByteSource,
  offset: number,
  length: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const output = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    if (signal?.aborted) throw signal.reason;
    let chunk: Buffer;
    try {
      chunk = await source.read(offset + read, length - read, signal);
    } catch (error) {
      throw new AinNvrError('recorded_source_failed', 'Recorded byte source read failed.', {
        cause: error,
        details: { sourceId: source.id, offset: offset + read, length: length - read },
      });
    }
    if (chunk.length === 0 || chunk.length > length - read) {
      throw new RecordedStreamError('Recorded byte source returned an invalid read length.');
    }
    chunk.copy(output, read);
    read += chunk.length;
  }
  return output;
}
