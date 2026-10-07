import type { SdpRtpMap } from './sdp-rtp-map.interface.js';
import type { SdpMediaDescription } from './sdp-media-description.interface.js';
import type { SdpDescription } from './sdp-description.interface.js';

export function selectH264VideoMedia(
  description: SdpDescription,
): { media: SdpMediaDescription; rtpMap: SdpRtpMap } | undefined {
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
