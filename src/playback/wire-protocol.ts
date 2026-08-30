export const PLAYBACK_PROTOCOL_VERSION = 1;
export const ACCESS_UNIT_HEADER_BYTES = 36;
export const ACCESS_UNIT_MAGIC = Buffer.from('RPOC', 'ascii');
export const DEFAULT_MAX_ACCESS_UNIT_BYTES = 16 * 1024 * 1024;

export interface BinaryAccessUnit {
  readonly kind: 'video' | 'audio';
  readonly generation: number;
  readonly timestampUs: number;
  readonly wallClockTimeMs: number;
  readonly durationUs: number;
  readonly key: boolean;
  readonly discontinuity: boolean;
  readonly endOfStream: boolean;
  readonly payload: Buffer;
}

export class PlaybackProtocolError extends Error {
  override readonly name = 'PlaybackProtocolError';

  constructor(
    message: string,
    readonly closeCode = 1002,
  ) {
    super(message);
  }
}

function requireUnsignedSafeInteger(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new PlaybackProtocolError(`${name} is outside its unsigned integer range.`);
  }
}

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

interface OpenMessage {
  readonly type: 'open';
  readonly protocolVersion: 1;
  readonly cameraId: string;
  readonly startTimeMs: number;
  readonly includeAudio: boolean;
}

interface SeekMessage {
  readonly type: 'seek';
  readonly timeMs: number;
}

interface PauseMessage { readonly type: 'pause' }
interface ResumeMessage { readonly type: 'resume' }
interface CloseMessage { readonly type: 'close' }
interface AckMessage {
  readonly type: 'ack';
  readonly generation: number;
  readonly renderedThroughUs: number;
  readonly decodeQueueSize: number;
}

interface MetricMessage {
  readonly type: 'metric';
  readonly generation: number;
  readonly name: 'decoder_reconfiguration' | 'decoder_recovery';
}

interface ClientErrorMessage {
  readonly type: 'client_error';
  readonly generation: number;
  readonly code: 'unsupported_browser_codec';
}

export type ClientPlaybackMessage = OpenMessage | SeekMessage | PauseMessage
  | ResumeMessage | CloseMessage | AckMessage | MetricMessage | ClientErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseClientPlaybackMessage(text: string): ClientPlaybackMessage {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new PlaybackProtocolError('Control message is not valid JSON.');
  }
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new PlaybackProtocolError('Control message must be an object with a type.');
  }
  switch (value.type) {
    case 'open':
      if (value.protocolVersion !== PLAYBACK_PROTOCOL_VERSION
        || typeof value.cameraId !== 'string' || value.cameraId.length === 0
        || value.cameraId.length > 128 || !safeTime(value.startTimeMs)
        || typeof value.includeAudio !== 'boolean') {
        throw new PlaybackProtocolError('Open message fields are invalid.');
      }
      return value as unknown as OpenMessage;
    case 'seek':
      if (!safeTime(value.timeMs)) {
        throw new PlaybackProtocolError('Seek time is invalid.');
      }
      return { type: 'seek', timeMs: value.timeMs };
    case 'pause':
    case 'resume':
    case 'close':
      return { type: value.type };
    case 'ack':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || !safeTime(value.renderedThroughUs) || !safeTime(value.decodeQueueSize)
        || value.decodeQueueSize > 10_000) {
        throw new PlaybackProtocolError('Acknowledgement fields are invalid.');
      }
      return {
        type: 'ack',
        generation: value.generation,
        renderedThroughUs: value.renderedThroughUs,
        decodeQueueSize: value.decodeQueueSize,
      };
    case 'metric':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || (value.name !== 'decoder_reconfiguration' && value.name !== 'decoder_recovery')) {
        throw new PlaybackProtocolError('Playback metric fields are invalid.');
      }
      return {
        type: 'metric',
        generation: value.generation,
        name: value.name,
      };
    case 'client_error':
      if (!safeTime(value.generation) || value.generation > 0xffff_ffff
        || value.code !== 'unsupported_browser_codec') {
        throw new PlaybackProtocolError('Client playback error fields are invalid.');
      }
      return {
        type: 'client_error',
        generation: value.generation,
        code: value.code,
      };
    default:
      throw new PlaybackProtocolError(`Unknown control message type ${value.type}.`);
  }
}
