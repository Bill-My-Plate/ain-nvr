import { RTSP_PARSER_CONSTANTS } from '../constants/rtsp-parser-numeric-values.constant.js';
import type { SdpRtpMap } from '../types/sdp-rtp-map.interface.js';
import type { SdpMediaDescription } from '../types/sdp-media-description.interface.js';
import type { SdpDescription } from '../types/sdp-description.interface.js';
/**
 * Selects an SDP audio track with supported PCMU or PCMA RTP mapping.
 */
export function selectG711AudioMedia(description: SdpDescription):
  | {
      /** SDP media section selected for this codec. */
      media: SdpMediaDescription;
      /** RTP payload mapping selected from the SDP media section. */
      rtpMap: SdpRtpMap;
      /** Codec name supported by this parser. */
      codec: 'pcmu' | 'pcma';
    }
  | undefined {
  for (const media of description.media) {
    if (media.mediaType.toLowerCase() !== 'audio') continue;
    for (const payloadType of media.payloadTypes) {
      const mapped = media.rtpMaps.get(payloadType);
      const encoding =
        mapped?.encodingName.toLowerCase() ??
        (payloadType === 0
          ? 'pcmu'
          : payloadType === RTSP_PARSER_CONSTANTS.g711PcmaPayloadType
            ? 'pcma'
            : '');
      if (encoding !== 'pcmu' && encoding !== 'pcma') continue;
      return {
        media,
        rtpMap: mapped ?? {
          payloadType,
          encodingName: encoding.toUpperCase(),
          clockRate: RTSP_PARSER_CONSTANTS.g711ClockRate,
          channels: 1,
        },
        codec: encoding,
      };
    }
  }
  return undefined;
}
