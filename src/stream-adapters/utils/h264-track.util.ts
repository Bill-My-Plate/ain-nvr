


import type { TrackDescription } from '../../media/index.js';





export function h264Track(tracks: readonly TrackDescription[]): TrackDescription | undefined {
  return tracks.find((track) => track.mediaType === 'video' && track.codec === 'h264');
}
