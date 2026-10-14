import type { SdpRtpMap } from '../types/sdp-rtp-map.interface.js';
import type { SdpMediaDescription } from '../types/sdp-media-description.interface.js';
import type { SdpDescription } from '../types/sdp-description.interface.js';
/**
 * Selects an SDP video track with a supported H.264 RTP mapping.
 */
export function selectH264VideoMedia(description: SdpDescription):
  | {
      /** SDP media section selected for this codec. */
      media: SdpMediaDescription;
      /** RTP payload mapping selected from the SDP media section. */
      rtpMap: SdpRtpMap;
    }
  | undefined {
  for (const media of description.media) {
    if (media.mediaType.toLowerCase() !== 'video') {
      continue;
    }
    for (const payloadType of media.payloadTypes) {
      const rtpMap = media.rtpMaps.get(payloadType);
      if (rtpMap?.encodingName.toLowerCase() === 'h264') {
        return { media, rtpMap };
      }
    }
  }
  return undefined;
}
