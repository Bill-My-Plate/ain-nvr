import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
import type { RecordedPacket } from '../../recorded-stream-parser/index.js';

import type { PcmAudioAccessUnit } from '../types/pcm-audio-access-unit.interface.js';
import { decodeG711Payload } from './decode-g711-payload.util.js';
/**
 * Decodes a G.711 packet into one timestamped PCM access unit.
 */
export function createG711AccessUnit(
  packet: RecordedPacket,
  playbackStartTimeMs: number,
): PcmAudioAccessUnit | undefined {
  const rtp = packet.rtp;
  const track = packet.track;
  if (
    rtp === undefined ||
    track === undefined ||
    (track.codec !== 'pcmu' && track.codec !== 'pcma') ||
    rtp.payloadType !== track.payloadType
  ) {
    return undefined;
  }
  const wallClockTimeMs = packet.wallClockTimeMs;
  return {
    kind: 'audio',
    timestampUs: Math.max(
      0,
      Math.round(
        (wallClockTimeMs - playbackStartTimeMs) * PLAYBACK_CONSTANTS.microsecondsPerMillisecond,
      ),
    ),
    wallClockTimeMs,
    durationUs: Math.round(
      (rtp.payload.length * PLAYBACK_CONSTANTS.microsecondsPerSecond) / track.clockRate,
    ),
    sampleFormat: 's16le',
    sampleRate: track.clockRate,
    channels: 1,
    data: decodeG711Payload(rtp.payload, track.codec),
  };
}
