/**
 * Stores unread bytes in arrival order without joining incoming chunks.
 * headIndex/headOffset point to the first unread byte; byteLength counts all
 * unread bytes from there to the end of chunks.
 *
 * push() retains the caller's Buffer, so the caller must not mutate it later.
 * peek() and read() return copies and cannot expose queued storage.
 */
export class ByteQueue {
  private chunks: Buffer[] = [];
  private headIndex = 0;
  private headOffset = 0;
  private byteLength = 0;

  public get length(): number {
    return this.byteLength;
  }

  public push(chunk: Buffer): void {
    if (chunk.length === 0) {
      return;
    }
    this.chunks.push(chunk);
    this.byteLength += chunk.length;
  }

  public peekByte(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.byteLength) {
      throw new RangeError("Byte index is outside the queue.");
    }

    let remaining = index;
    for (
      let chunkIndex = this.headIndex;
      chunkIndex < this.chunks.length;
      chunkIndex += 1
    ) {
      const chunk = this.chunks[chunkIndex];
      if (chunk === undefined) {
        break;
      }

      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        const byte = chunk[start + remaining];
        if (byte === undefined) {
          throw new Error("Byte queue invariant failed.");
        }
        return byte;
      }
      remaining -= available;
    }

    throw new Error("Byte queue length invariant failed.");
  }

  /** Returns an offset from the first unread byte, searching at most maximumBytes. */
  public indexOf(sequence: Buffer, maximumBytes = this.byteLength): number {
    if (sequence.length === 0) {
      return 0;
    }

    const searchableBytes = Math.min(this.byteLength, Math.floor(maximumBytes));
    if (!(searchableBytes >= sequence.length)) {
      return -1;
    }

    // Use the native search when the entire search window is contiguous.
    // This temporary view never escapes the queue.
    const first = this.chunks[this.headIndex];
    if (first !== undefined && first.length - this.headOffset >= searchableBytes) {
      return first.subarray(this.headOffset, this.headOffset + searchableBytes).indexOf(sequence);
    }

    // KMP fallback lengths let a mismatch reuse a matched prefix instead of
    // rescanning earlier bytes, including when a match crosses chunks.
    const prefix = new Uint32Array(sequence.length);
    for (let index = 1, matched = 0; index < sequence.length; index += 1) {
      while (matched > 0 && sequence[index] !== sequence[matched]) {
        matched = prefix[matched - 1] ?? 0;
      }
      if (sequence[index] === sequence[matched]) {
        matched += 1;
      }
      prefix[index] = matched;
    }

    // matched carries across chunks; scanned counts bytes before this chunk.
    let scanned = 0;
    let matched = 0;
    for (let chunkIndex = this.headIndex; scanned < searchableBytes; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      if (chunk === undefined) {
        throw new Error("Byte queue length invariant failed.");
      }
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const end = Math.min(chunk.length, start + searchableBytes - scanned);
      for (let offset = start; offset < end; offset += 1) {
        const byte = chunk[offset];
        while (matched > 0 && byte !== sequence[matched]) {
          matched = prefix[matched - 1] ?? 0;
        }
        if (byte === sequence[matched]) {
          matched += 1;
        }
        if (matched === sequence.length) {
          return scanned + offset - start - sequence.length + 1;
        }
      }
      scanned += end - start;
    }

    return -1;
  }

  public peek(length: number): Buffer {
    this.validateLength(length);
    // Always copy: a subarray would let callers change unread bytes in place.
    // The loop fills every byte before returning this uninitialized allocation.
    const output = Buffer.allocUnsafe(length);
    let outputOffset = 0;
    let remaining = length;

    for (let chunkIndex = this.headIndex; remaining > 0; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      if (chunk === undefined) {
        throw new Error("Byte queue length invariant failed.");
      }
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const copied = Math.min(remaining, chunk.length - start);
      chunk.copy(output, outputOffset, start, start + copied);
      outputOffset += copied;
      remaining -= copied;
    }

    return output;
  }

  public read(length: number): Buffer {
    const output = this.peek(length);
    this.discard(length);
    return output;
  }

  public discard(length: number): void {
    this.validateLength(length);
    // Advance the head instead of copying remaining bytes. compact() later
    // drops fully consumed chunk references when doing so is worthwhile.
    let remaining = length;

    while (remaining > 0) {
      const chunk = this.chunks[this.headIndex];
      if (chunk === undefined) {
        throw new Error("Byte queue length invariant failed.");
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

  public clear(): void {
    this.chunks = [];
    this.headIndex = 0;
    this.headOffset = 0;
    this.byteLength = 0;
  }

  private validateLength(length: number): void {
    if (!Number.isInteger(length) || length < 0 || length > this.byteLength) {
      throw new RangeError("Requested byte length is outside the queue.");
    }
  }

  private compact(): void {
    // Clear immediately when empty; otherwise amortize array slicing until
    // at least 64 chunks and half the array have been consumed.
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
