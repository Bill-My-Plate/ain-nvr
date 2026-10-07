import { PLAYBACK_PROTOCOL_VERSION } from './playback-protocol-version.constant.js';
import { ACCESS_UNIT_HEADER_BYTES } from './access-unit-header-bytes.constant.js';
import { ACCESS_UNIT_MAGIC } from './access-unit-magic.constant.js';
import { DEFAULT_MAX_ACCESS_UNIT_BYTES } from './default-max-access-unit-bytes.constant.js';
import type { BinaryAccessUnit } from './binary-access-unit.type.js';
import { PlaybackProtocolError } from './playback-protocol-error.class.js';
import { requireUnsignedSafeInteger } from './require-unsigned-safe-integer.util.js';

export function encodeAccessUnitMessage(
  accessUnit: BinaryAccessUnit,
  maximumPayloadBytes = DEFAULT_MAX_ACCESS_UNIT_BYTES,
): Buffer {
  requireUnsignedSafeInteger(accessUnit.generation, 'generation', 0xffff_ffff);
  requireUnsignedSafeInteger(accessUnit.timestampUs, 'timestampUs', Number.MAX_SAFE_INTEGER);
  requireUnsignedSafeInteger(accessUnit.wallClockTimeMs, 'wallClockTimeMs', Number.MAX_SAFE_INTEGER);
  requireUnsignedSafeInteger(accessUnit.durationUs, 'durationUs', 0xffff_ffff);
  if (accessUnit.payload.length > maximumPayloadBytes) {
    throw new PlaybackProtocolError('Encoded access unit exceeds the payload limit.', 1009);
  }
  const output = Buffer.allocUnsafe(ACCESS_UNIT_HEADER_BYTES + accessUnit.payload.length);
  ACCESS_UNIT_MAGIC.copy(output, 0);
  output[4] = PLAYBACK_PROTOCOL_VERSION;
  output[5] = accessUnit.kind === 'video' ? 1 : 2;
  let flags = 0;
  flags |= accessUnit.key ? 1 : 0;
  flags |= accessUnit.discontinuity ? 2 : 0;
  flags |= accessUnit.endOfStream ? 4 : 0;
  output.writeUInt16BE(flags, 6);
  output.writeUInt32BE(accessUnit.generation, 8);
  output.writeBigUInt64BE(BigInt(accessUnit.timestampUs), 12);
  output.writeBigUInt64BE(BigInt(accessUnit.wallClockTimeMs), 20);
  output.writeUInt32BE(accessUnit.durationUs, 28);
  output.writeUInt32BE(accessUnit.payload.length, 32);
  accessUnit.payload.copy(output, ACCESS_UNIT_HEADER_BYTES);
  return output;
}
