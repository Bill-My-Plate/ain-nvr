import type { SdpRtpMap } from '../types/sdp-rtp-map.interface.js';
import type { SdpMediaDescription } from '../types/sdp-media-description.interface.js';
import type { SdpDescription } from '../types/sdp-description.interface.js';

export function selectG711AudioMedia(
  description: SdpDescription,
): { media: SdpMediaDescription; rtpMap: SdpRtpMap; codec: 'pcmu' | 'pcma' } | undefined {
  for (const media of description.media) {
    if (media.mediaType.toLowerCase() !== 'audio') continue;
    for (const payloadType of media.payloadTypes) {
      const mapped = media.rtpMaps.get(payloadType);
      const encoding = mapped?.encodingName.toLowerCase()
        ?? (payloadType === 0 ? 'pcmu' : payloadType === 8 ? 'pcma' : '');
      if (encoding !== 'pcmu' && encoding !== 'pcma') continue;
      return {
        media,
        rtpMap: mapped ?? {
          payloadType,
          encodingName: encoding.toUpperCase(),
          clockRate: 8_000,
          channels: 1,
        },
        codec: encoding,
      };
    }
  }
  return undefined;
}
