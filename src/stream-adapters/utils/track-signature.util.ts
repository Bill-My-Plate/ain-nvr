


import type { TrackDescription } from '../../media/index.js';





export function trackSignature(track: TrackDescription): string {
  return `${track.payloadType}:${track.clockRate}:${track.rtpChannel}:${track.rtcpChannel}`;
}
