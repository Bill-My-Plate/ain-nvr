import type { MediaPacket } from '../media/index.js';








export function serializeInterleavedFrame(packet: MediaPacket): Buffer {
  const frame = packet.frame;
  if (frame.payload.length <= 0 || frame.payload.length > 65_535) {
    throw new RangeError('Interleaved payload length is invalid.');
  }
  if (packet.rawInterleavedFrame.length === frame.payload.length + 4
    && packet.rawInterleavedFrame[0] === 0x24) {
    return packet.rawInterleavedFrame;
  }
  const header = Buffer.allocUnsafe(4);
  header[0] = 0x24;
  header[1] = frame.channel;
  header.writeUInt16BE(frame.payload.length, 2);
  return Buffer.concat([header, frame.payload]);
}
