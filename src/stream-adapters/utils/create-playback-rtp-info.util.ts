import type { ClientState } from '../types/client-state.type.js';
import type { PlaybackRtspServerOptions } from '../types/playback-rtsp-server-options.type.js';

/** Describes the negotiated RTP sequence and timestamp origins for RTSP PLAY. */
export function createPlaybackRtpInfo(
  client: ClientState,
  options: PlaybackRtspServerOptions,
  url: string,
): string {
  // Both timestamps describe the same npt=0 instant, not each track's first
  // packet. Otherwise the client independently rebases delayed audio to zero.
  return [...client.channels.keys()]
    .flatMap((track) => {
      const info = track === 0 ? options.videoRtpInfo : options.audioRtpInfo;
      if (info === undefined) return [];
      return [
        `url=${url}/trackID=${track};seq=${info.initialSequenceNumber};rtptime=${info.initialTimestamp}`,
      ];
    })
    .join(',');
}
