import path from 'node:path';
import {
  createH264CodecConfiguration,
  type H264CodecConfiguration,
} from '../rtp/h264-configuration.js';
import type { RtspSessionTrackInfo } from '../stream/rtsp-stream-session.js';
import type { SessionTrack } from './metadata.js';


export class RecordingPathUtil {
  public static resolveInsideRoot(root: string, ...parts: string[]): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...parts);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Recording path escaped its configured root.');
    }
    return resolved;
  }

  public static nativeHourStart(timeMs: number): number {
    return Math.floor(timeMs / 3_600_000) * 3_600_000;
  }
}

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
