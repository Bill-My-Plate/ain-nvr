






export function interleavedFrame(channel: number, packet: Buffer): Buffer {
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x24;
  header[1] = channel;
  header.writeUInt16BE(packet.length, 2);
  return Buffer.concat([header, packet]);
}
