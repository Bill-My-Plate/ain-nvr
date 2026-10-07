import type { RecordedPacket } from '../../recorded-stream-parser/index.js';

import type { PcmAudioAccessUnit } from '../types/pcm-audio-access-unit.interface.js';
import { decodeG711Payload } from './decode-g711-payload.util.js';

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
    sampleFormat: 's16le',
    sampleRate: track.clockRate,
    channels: 1,
    data: decodeG711Payload(rtp.payload, track.codec),
  };
}
