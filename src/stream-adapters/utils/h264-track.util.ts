import type { TrackDescription } from '../../media/index.js';
/**
 * Finds the negotiated H.264 video track required by a bridge.
 */
export function h264Track(tracks: readonly TrackDescription[]): TrackDescription | undefined {
  return tracks.find((track) => track.mediaType === 'video' && track.codec === 'h264');
}
