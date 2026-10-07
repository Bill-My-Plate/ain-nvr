
import { createH264CodecConfiguration, type H264CodecConfiguration } from '../../h264/index.js';
import type { RtspSessionTrackInfo } from '../../stream-session/index.js';
import type { SessionTrack } from '../types/session-track.type.js';

export class RecordingSegmentWriterUtil {
  public static positiveInteger(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
    return value;
  }

  public static toSessionTrack(
    track: RtspSessionTrackInfo,
  ): SessionTrack {
    let configuration: H264CodecConfiguration | undefined;
    if (track.parameterSets !== undefined) {
      try {
        configuration = createH264CodecConfiguration(
          track.parameterSets.sps,
          track.parameterSets.pps,
        );
      } catch {
        // Valid in-band configuration may replace invalid SDP data later.
      }
    }
    return {
      trackId: track.trackId,
      mediaType: track.mediaType,
      codec: track.codec,
      clockRate: track.clockRate,
      payloadType: track.payloadType,
      control: track.control,
      rtpChannel: track.rtpChannel,
      rtcpChannel: track.rtcpChannel,
      ...(track.fmtp === undefined ? {} : { fmtp: track.fmtp }),
      ...(configuration === undefined
        ? {}
        : {
            webCodec: configuration.decoder,
            parameterSetsBase64: {
              sps: configuration.sps.toString('base64'),
              pps: configuration.pps.toString('base64'),
            },
          }),
    };
  }
}
