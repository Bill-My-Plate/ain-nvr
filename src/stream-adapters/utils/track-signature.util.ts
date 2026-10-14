import type { TrackDescription } from '../../media/index.js';
/**
 * Builds a stable signature for comparing negotiated media tracks.
 */
export function trackSignature(track: TrackDescription): string {
  return `${track.payloadType}:${track.clockRate}:${track.rtpChannel}:${track.rtcpChannel}`;
}
