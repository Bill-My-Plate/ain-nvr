import { PLAYBACK_PROTOCOL_VERSION } from './playback-protocol-version.constant.js';
import { ACCESS_UNIT_HEADER_BYTES } from './access-unit-header-bytes.constant.js';
import { ACCESS_UNIT_MAGIC } from './access-unit-magic.constant.js';
import { DEFAULT_MAX_ACCESS_UNIT_BYTES } from './default-max-access-unit-bytes.constant.js';
import type { BinaryAccessUnit } from './binary-access-unit.type.js';
import { PlaybackProtocolError } from './playback-protocol-error.class.js';

export function decodeAccessUnitMessage(
  message: Buffer,
  maximumPayloadBytes = DEFAULT_MAX_ACCESS_UNIT_BYTES,
): BinaryAccessUnit {
  if (message.length < ACCESS_UNIT_HEADER_BYTES) {
    throw new PlaybackProtocolError('Binary access-unit header is truncated.');
  }
  if (!message.subarray(0, 4).equals(ACCESS_UNIT_MAGIC)) {
    throw new PlaybackProtocolError('Binary access-unit magic is invalid.');
  }
  if (message[4] !== PLAYBACK_PROTOCOL_VERSION) {
    throw new PlaybackProtocolError('Binary access-unit version is unsupported.');
  }
  const rawKind = message[5];
  if (rawKind !== 1 && rawKind !== 2) {
    throw new PlaybackProtocolError('Binary access-unit kind is invalid.');
  }
  const flags = message.readUInt16BE(6);
  if ((flags & ~0x07) !== 0) {
    throw new PlaybackProtocolError('Binary access-unit flags are invalid.');
  }
  const payloadLength = message.readUInt32BE(32);
  if (payloadLength > maximumPayloadBytes) {
    throw new PlaybackProtocolError('Encoded access unit exceeds the payload limit.', 1009);
  }
  if (message.length !== ACCESS_UNIT_HEADER_BYTES + payloadLength) {
    throw new PlaybackProtocolError('Binary access-unit payload length does not match the message.');
  }
  const timestampUs = Number(message.readBigUInt64BE(12));
  const wallClockTimeMs = Number(message.readBigUInt64BE(20));
  if (!Number.isSafeInteger(timestampUs) || !Number.isSafeInteger(wallClockTimeMs)) {
    throw new PlaybackProtocolError('Binary access-unit timestamp exceeds the safe integer range.');
  }
  return {
    kind: rawKind === 1 ? 'video' : 'audio',
    generation: message.readUInt32BE(8),
    timestampUs,
    wallClockTimeMs,
    durationUs: message.readUInt32BE(28),
    key: (flags & 1) !== 0,
    discontinuity: (flags & 2) !== 0,
    endOfStream: (flags & 4) !== 0,
    payload: message.subarray(ACCESS_UNIT_HEADER_BYTES),
  };
}
