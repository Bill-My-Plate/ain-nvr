const EMPTY_BUFFER = Buffer.alloc(0);

export class ByteQueue {
  private chunks: Buffer[] = [];
  private headIndex = 0;
  private headOffset = 0;
  private byteLength = 0;

  get length(): number {
    return this.byteLength;
  }

  push(chunk: Buffer): void {
    if (chunk.length === 0) {
      return;
    }
    this.chunks.push(chunk);
    this.byteLength += chunk.length;
  }

  peekByte(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.byteLength) {
      throw new RangeError('Byte index is outside the queue.');
    }

    let remaining = index;
    for (let chunkIndex = this.headIndex; chunkIndex < this.chunks.length; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      if (chunk === undefined) {
        break;
      }

      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        const byte = chunk[start + remaining];
        if (byte === undefined) {
          throw new Error('Byte queue invariant failed.');
        }
        return byte;
      }
      remaining -= available;
    }

    throw new Error('Byte queue length invariant failed.');
  }

  indexOf(sequence: Buffer, maximumBytes = this.byteLength): number {
    if (sequence.length === 0) {
      return 0;
    }

    const searchableBytes = Math.min(this.byteLength, maximumBytes);
    const lastStart = searchableBytes - sequence.length;
    for (let start = 0; start <= lastStart; start += 1) {
      let matches = true;
      for (let offset = 0; offset < sequence.length; offset += 1) {
        if (this.peekByte(start + offset) !== sequence[offset]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return start;
      }
    }

    return -1;
  }

  peek(length: number): Buffer {
    this.validateLength(length);
    if (length === 0) {
      return EMPTY_BUFFER;
    }

    const first = this.chunks[this.headIndex];
    if (first !== undefined && first.length - this.headOffset >= length) {
      return first.subarray(this.headOffset, this.headOffset + length);
    }

    const output = Buffer.allocUnsafe(length);
    let outputOffset = 0;
    let remaining = length;

    for (let chunkIndex = this.headIndex; remaining > 0; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      if (chunk === undefined) {
        throw new Error('Byte queue length invariant failed.');
      }
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const copied = Math.min(remaining, chunk.length - start);
      chunk.copy(output, outputOffset, start, start + copied);
      outputOffset += copied;
      remaining -= copied;
    }

    return output;
  }

  read(length: number): Buffer {
    const output = this.peek(length);
    this.discard(length);
    return output;
  }

  discard(length: number): void {
    this.validateLength(length);
    let remaining = length;

    while (remaining > 0) {
      const chunk = this.chunks[this.headIndex];
      if (chunk === undefined) {
        throw new Error('Byte queue length invariant failed.');
      }

      const available = chunk.length - this.headOffset;
      if (remaining < available) {
        this.headOffset += remaining;
        remaining = 0;
      } else {
        remaining -= available;
        this.headIndex += 1;
        this.headOffset = 0;
      }
    }

    this.byteLength -= length;
    this.compact();
  }

  clear(): void {
    this.chunks = [];
    this.headIndex = 0;
    this.headOffset = 0;
    this.byteLength = 0;
  }

  private validateLength(length: number): void {
    if (!Number.isInteger(length) || length < 0 || length > this.byteLength) {
      throw new RangeError('Requested byte length is outside the queue.');
    }
  }

  private compact(): void {
    if (this.byteLength === 0) {
      this.clear();
      return;
    }

    if (this.headIndex >= 64 && this.headIndex * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.headIndex);
      this.headIndex = 0;
    }
  }
}
