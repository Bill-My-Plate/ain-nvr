import { RECORDING_PARSER_CONSTANTS } from '../constants/recording-parser-numeric-values.constant.js';
import type { MediaPacket } from '../../media/index.js';
/**
 * Prefixes a complete RTP or RTCP packet with its four-byte RTSP interleaved header.
 */
export function serializeInterleavedFrame(packet: MediaPacket): Buffer {
  const frame = packet.frame;
  if (
    frame.payload.length <= 0 ||
    frame.payload.length > RECORDING_PARSER_CONSTANTS.maximumInterleavedPayloadBytes
  ) {
    throw new RangeError('Interleaved payload length is invalid.');
  }
  if (
    packet.rawInterleavedFrame.length ===
      frame.payload.length + RECORDING_PARSER_CONSTANTS.interleavedHeaderBytes &&
    packet.rawInterleavedFrame[0] === RECORDING_PARSER_CONSTANTS.interleavedMarker
  ) {
    return packet.rawInterleavedFrame;
  }
  const header = Buffer.allocUnsafe(RECORDING_PARSER_CONSTANTS.interleavedHeaderBytes);
  header[0] = RECORDING_PARSER_CONSTANTS.interleavedMarker;
  header[1] = frame.channel;
  header.writeUInt16BE(frame.payload.length, RECORDING_PARSER_CONSTANTS.interleavedLengthOffset);
  return Buffer.concat([header, frame.payload]);
}
