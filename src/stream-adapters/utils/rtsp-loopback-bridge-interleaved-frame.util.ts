








export function interleavedFrame(channel: number, payload: Buffer): Buffer {
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x24;
  header[1] = channel;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
