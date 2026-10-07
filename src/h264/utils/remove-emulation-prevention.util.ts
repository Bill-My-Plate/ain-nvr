export function removeEmulationPrevention(data: Buffer): Buffer {
  const output: number[] = [];
  let zeroCount = 0;
  for (const byte of data) {
    if (zeroCount >= 2 && byte === 0x03) {
      zeroCount = 0;
      continue;
    }
    output.push(byte);
    zeroCount = byte === 0 ? zeroCount + 1 : 0;
  }
  return Buffer.from(output);
}
