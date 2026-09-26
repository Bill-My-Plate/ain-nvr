import type { H264CodecConfiguration } from '../rtp/h264-configuration.js';
import { AinNvrError } from '../shared/ain-nvr-error.js';
import {
  RecordedRtspParser,
  type RecordedSegmentDescriptor,
} from '../recorded-stream-parser/recorded-rtsp-parser.js';
import {
  H264AccessUnitAssembler,
  type H264AccessUnit,
} from './access-unit-assembler.js';
import { createG711AccessUnit, type PcmAudioAccessUnit } from './g711.js';

export type PlaybackSegment<TSegmentRef> = RecordedSegmentDescriptor<TSegmentRef>;

export interface PlaybackStart<TSegmentRef> {
  readonly segment: PlaybackSegment<TSegmentRef>;
  readonly byteOffset: number;
  readonly actualStartTimeMs: number;
}

export interface PlaybackSource<TSegmentRef> {
  resolveStart(
    cameraId: string,
    requestedTimeMs: number,
    signal?: AbortSignal,
  ): Promise<PlaybackStart<TSegmentRef>>;
  nextSegment(
    segment: TSegmentRef,
    signal?: AbortSignal,
  ): Promise<PlaybackSegment<TSegmentRef> | undefined>;
}

export type PlaybackControl =
  | {
      readonly kind: 'ready';
      readonly requestedTimeMs: number;
      readonly actualStartTimeMs: number;
      readonly configuration: H264CodecConfiguration;
    }
  | {
      readonly kind: 'configuration';
      readonly configuration: H264CodecConfiguration;
      readonly timestampUs: number;
    }
  | {
      readonly kind: 'end';
      readonly reason: 'end-of-recording' | 'incompatible-session' | 'recording-gap';
    };

export type PlaybackVideoAccessUnit = H264AccessUnit & { readonly kind: 'video' };
export type PlaybackMessage = PlaybackControl | PlaybackVideoAccessUnit | PcmAudioAccessUnit;

export interface PlaybackOptions<TSegmentRef> {
  readonly source: PlaybackSource<TSegmentRef>;
  readonly cameraId: string;
  readonly startTimeMs: number;
  readonly signal?: AbortSignal;
  readonly maximumGapMs?: number;
  readonly maximumBootstrapBytes?: number;
  readonly maximumBootstrapDurationMs?: number;
}

export class PlaybackMediaError extends AinNvrError {
  override readonly name = 'PlaybackMediaError';
}

function sameConfiguration(
  left: H264CodecConfiguration | undefined,
  right: H264CodecConfiguration,
): boolean {
  return left?.decoder.codec === right.decoder.codec
    && left.sps.equals(right.sps)
    && left.pps.equals(right.pps);
}

export async function* createPlaybackStream<TSegmentRef>(
  options: PlaybackOptions<TSegmentRef>,
): AsyncGenerator<PlaybackMessage> {
  const maximumGapMs = options.maximumGapMs ?? 5_000;
  const maximumBootstrapBytes = options.maximumBootstrapBytes ?? 64 * 1024 * 1024;
  const maximumBootstrapDurationMs = options.maximumBootstrapDurationMs ?? 30_000;
  if (!Number.isSafeInteger(maximumGapMs) || maximumGapMs < 0
    || !Number.isSafeInteger(maximumBootstrapBytes) || maximumBootstrapBytes <= 0
    || !Number.isSafeInteger(maximumBootstrapDurationMs) || maximumBootstrapDurationMs <= 0) {
    throw new RangeError('Playback limits are invalid.');
  }
  if (options.signal?.aborted) throw options.signal.reason;

  const start = await options.source.resolveStart(
    options.cameraId,
    options.startTimeMs,
    options.signal,
  );
  let segment = start.segment;
  let byteOffset = start.byteOffset;
  const video = segment.tracks.find((track) => track.mediaType === 'video' && track.codec === 'h264');
  if (video === undefined) {
    throw new PlaybackMediaError('unsupported_codec', 'Playback source has no H.264 video track.');
  }
  const assembler = new H264AccessUnitAssembler({
    payloadType: video.payloadType,
    clockRate: video.clockRate,
    ...(video.parameterSets === undefined ? {} : { parameterSets: video.parameterSets }),
    playbackStartTimeMs: start.actualStartTimeMs,
  });
  const parser = new RecordedRtspParser();
  let ready = false;
  let activeConfiguration: H264CodecConfiguration | undefined;
  let bootstrapBytes = 0;
  let lastBootstrapTimeMs = start.actualStartTimeMs;
  let sawVideoPacket = false;
  const pendingAudio: PcmAudioAccessUnit[] = [];

  const consumeVideoUnit = (unit: H264AccessUnit): PlaybackMessage[] => {
    const messages: PlaybackMessage[] = [];
    if (!ready) {
      if (unit.type !== 'key') return messages;
      const configuration = unit.configuration ?? assembler.configuration;
      if (configuration === undefined) return messages;
      activeConfiguration = configuration;
      ready = true;
      messages.push({
        kind: 'ready',
        requestedTimeMs: options.startTimeMs,
        actualStartTimeMs: start.actualStartTimeMs,
        configuration,
      });
    } else if (unit.type === 'key' && unit.configuration !== undefined
      && !sameConfiguration(activeConfiguration, unit.configuration)) {
      activeConfiguration = unit.configuration;
      messages.push({
        kind: 'configuration',
        configuration: unit.configuration,
        timestampUs: unit.timestampUs,
      });
    }
    if (ready) messages.push({ ...unit, kind: 'video' });
    return messages;
  };

  while (true) {
    for await (const packet of parser.parse(segment, byteOffset, options.signal)) {
      if (options.signal?.aborted) throw options.signal.reason;
      bootstrapBytes += ready ? 0 : packet.frame.rawHeader.length + packet.frame.payload.length;
      lastBootstrapTimeMs = Math.max(lastBootstrapTimeMs, packet.wallClockTimeMs);
      if (!ready && (bootstrapBytes > maximumBootstrapBytes
        || lastBootstrapTimeMs - start.actualStartTimeMs > maximumBootstrapDurationMs)) {
        const configuration = assembler.configuration;
        throw configuration === undefined
          ? new PlaybackMediaError(
            'no_decoder_configuration',
            'No valid H.264 SPS/PPS was found within the playback bootstrap limit.',
          )
          : new PlaybackMediaError(
            'no_sync_frame',
            'No complete H.264 IDR was found within the playback bootstrap limit.',
          );
      }

      if (packet.track?.mediaType === 'video' && packet.rtp !== undefined) {
        sawVideoPacket = true;
        const units = assembler.push({
          rtp: packet.rtp,
          wallClockTimeMs: packet.wallClockTimeMs,
          discontinuity: packet.discontinuity,
          ...(packet.sequenceGap === undefined ? {} : { lostBefore: packet.sequenceGap.lost }),
        });
        for (const unit of units) {
          const wasReady = ready;
          for (const message of consumeVideoUnit(unit)) yield message;
          if (!wasReady && ready) {
            for (const audio of pendingAudio.splice(0)) yield audio;
          }
        }
        continue;
      }

      if (packet.track?.mediaType === 'audio') {
        const audio = createG711AccessUnit(packet, start.actualStartTimeMs);
        if (audio !== undefined) {
          if (ready) yield audio;
          else {
            pendingAudio.push(audio);
            if (pendingAudio.length > 512) pendingAudio.shift();
          }
        }
      }
    }

    const next = await options.source.nextSegment(segment.ref, options.signal);
    // A terminating boundary cannot supply the next timestamp that normally
    // releases the pending access unit. Flush it exactly as at recording EOF.
    // Continuous segments may split a FU-A, so never flush between those.
    if (next === undefined || next.sessionId !== segment.sessionId
      || next.startTimeMs - segment.endTimeMs > maximumGapMs) {
      for (const unit of assembler.flush()) {
        const wasReady = ready;
        for (const message of consumeVideoUnit(unit)) yield message;
        if (!wasReady && ready) {
          for (const audio of pendingAudio.splice(0)) yield audio;
        }
      }
    }
    if (next === undefined) {
      if (!ready) {
        throw assembler.configuration === undefined
          ? new PlaybackMediaError(
            'no_decoder_configuration',
            'Recording ended before a valid H.264 decoder configuration was found.',
          )
          : new PlaybackMediaError(
            'no_sync_frame',
            sawVideoPacket
              ? 'Recording ended before a complete H.264 IDR was found.'
              : 'Recording contains no H.264 packets.',
          );
      }
      yield { kind: 'end', reason: 'end-of-recording' };
      return;
    }
    if (next.sessionId !== segment.sessionId) {
      if (!ready) {
        throw new PlaybackMediaError('recording_gap', 'Playback reached an incompatible session.');
      }
      yield { kind: 'end', reason: 'incompatible-session' };
      return;
    }
    if (next.startTimeMs - segment.endTimeMs > maximumGapMs) {
      if (!ready) {
        throw new PlaybackMediaError('recording_gap', 'Playback reached a recording gap.');
      }
      yield { kind: 'end', reason: 'recording-gap' };
      return;
    }
    segment = next;
    byteOffset = 0;
  }
}
