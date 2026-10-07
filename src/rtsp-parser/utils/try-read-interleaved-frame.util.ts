import { ByteQueue } from '../services/byte-queue.class.js';
import { RtspParseError } from '../errors/rtsp-parse-error.class.js';
import { type RtspParserLimits } from '../types/rtsp-parser-limits.interface.js';

import { RTSP_INTERLEAVED_MAGIC } from '../constants/rtsp-interleaved-magic.constant.js';
import { INTERLEAVED_HEADER_LENGTH } from '../constants/interleaved-header-length.constant.js';
import type { RtspInterleavedFrame } from '../types/rtsp-interleaved-frame.interface.js';

export function tryReadInterleavedFrame(
  queue: ByteQueue,
  limits: RtspParserLimits,
): RtspInterleavedFrame | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  if (queue.peekByte(0) !== RTSP_INTERLEAVED_MAGIC) {
    throw new RtspParseError(
      'invalid_interleaved_magic',
      'Interleaved frame does not begin with the $ marker.',
    );
  }

  if (queue.length < INTERLEAVED_HEADER_LENGTH) {
    return undefined;
  }

  const rawHeader = queue.peek(INTERLEAVED_HEADER_LENGTH);
  const channel = rawHeader.readUInt8(1);
  const payloadLength = rawHeader.readUInt16BE(2);

  if (payloadLength === 0) {
    throw new RtspParseError(
      'invalid_interleaved_length',
      'Interleaved packet length must be greater than zero.',
    );
  }

  if (payloadLength > limits.maxInterleavedPacketBytes) {
    throw new RtspParseError(
      'interleaved_packet_too_large',
      `Interleaved packet exceeds the ${limits.maxInterleavedPacketBytes} byte limit.`,
    );
  }

  if (queue.length < INTERLEAVED_HEADER_LENGTH + payloadLength) {
    return undefined;
  }

  queue.discard(INTERLEAVED_HEADER_LENGTH);
  const payload = queue.read(payloadLength);
  return {
    type: 'interleaved-frame',
    channel,
    payload,
    rawHeader,
  };
}
