import type { RecordedPacket } from '../recorded-stream-parser/recorded-rtsp-parser.js';

export interface PcmAudioAccessUnit {
  readonly kind: 'audio';
  readonly timestampUs: number;
  readonly wallClockTimeMs: number;
  readonly durationUs: number;
  readonly sampleRate: number;
  readonly channels: 1;
  readonly data: Buffer;
}

function decodeMuLaw(value: number): number {
  const encoded = (~value) & 0xff;
  const sign = encoded & 0x80;
  const exponent = (encoded >>> 4) & 0x07;
  const mantissa = encoded & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign === 0 ? magnitude : -magnitude;
}

function decodeALaw(value: number): number {
  const encoded = value ^ 0x55;
  const sign = encoded & 0x80;
  const exponent = (encoded >>> 4) & 0x07;
  const mantissa = encoded & 0x0f;
  let magnitude = mantissa << 4;
  if (exponent === 0) {
    magnitude += 8;
  } else {
    magnitude += 0x108;
    magnitude <<= exponent - 1;
  }
  return sign === 0 ? -magnitude : magnitude;
}

export function decodeG711Payload(payload: Buffer, codec: 'pcmu' | 'pcma'): Buffer {
  const pcm = Buffer.allocUnsafe(payload.length * 2);
  for (let index = 0; index < payload.length; index += 1) {
    const encoded = payload[index] ?? 0;
    pcm.writeInt16LE(codec === 'pcmu' ? decodeMuLaw(encoded) : decodeALaw(encoded), index * 2);
  }
  return pcm;
}

export function createG711AccessUnit(
  packet: RecordedPacket,
  playbackStartTimeMs: number,
): PcmAudioAccessUnit | undefined {
  const rtp = packet.rtp;
  const track = packet.track;
  if (rtp === undefined || track === undefined
    || (track.codec !== 'pcmu' && track.codec !== 'pcma')
    || rtp.payloadType !== track.payloadType) {
    return undefined;
  }
  const wallClockTimeMs = packet.wallClockTimeMs;
  return {
    kind: 'audio',
    timestampUs: Math.max(0, Math.round((wallClockTimeMs - playbackStartTimeMs) * 1000)),
    wallClockTimeMs,
    durationUs: Math.round(rtp.payload.length * 1_000_000 / track.clockRate),
    sampleRate: track.clockRate,
    channels: 1,
    data: decodeG711Payload(rtp.payload, track.codec),
  };
}
