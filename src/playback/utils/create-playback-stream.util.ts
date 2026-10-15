import { H264AccessUnitAssembler } from '../../h264/index.js';
import { RecordedRtspParser } from '../../recorded-stream-parser/index.js';
import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
import { PlaybackMediaError } from '../errors/playback-media-error.class.js';
import { PlaybackStreamProcessor } from '../services/playback-stream-processor.class.js';
import type { PlaybackMessage } from '../types/playback-message.type.js';
import type { PlaybackOptions } from '../types/playback-options.interface.js';

/**
 * Reads recorded segments and yields timed video/audio playback messages.
 * The processor retains decoder and audio state across continuous segments;
 * this generator owns segment traversal and stopping at recording boundaries.
 */
export async function* createPlaybackStream<TSegmentRef>(
  options: PlaybackOptions<TSegmentRef>,
): AsyncGenerator<PlaybackMessage> {
  const maximumGapMs = options.maximumGapMs ?? PLAYBACK_CONSTANTS.defaultMaximumGapMs;
  const maximumBootstrapBytes =
    options.maximumBootstrapBytes ?? PLAYBACK_CONSTANTS.defaultMaximumBootstrapBytes;
  const maximumBootstrapDurationMs =
    options.maximumBootstrapDurationMs ?? PLAYBACK_CONSTANTS.defaultMaximumBootstrapDurationMs;
  if (
    !Number.isSafeInteger(maximumGapMs) ||
    maximumGapMs < 0 ||
    !Number.isSafeInteger(maximumBootstrapBytes) ||
    maximumBootstrapBytes <= 0 ||
    !Number.isSafeInteger(maximumBootstrapDurationMs) ||
    maximumBootstrapDurationMs <= 0
  ) {
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
  const video = segment.tracks.find(
    (track) => track.mediaType === 'video' && track.codec === 'h264',
  );
  if (video === undefined) {
    throw new PlaybackMediaError('unsupported_codec', 'Playback source has no H.264 video track.');
  }
  const assembler = new H264AccessUnitAssembler({
    payloadType: video.payloadType,
    clockRate: video.clockRate,
    ...(video.parameterSets === undefined ? {} : { parameterSets: video.parameterSets }),
    playbackStartTimeMs: start.actualStartTimeMs,
  });
  const processor = new PlaybackStreamProcessor(
    assembler,
    options.startTimeMs,
    start.actualStartTimeMs,
    maximumBootstrapBytes,
    maximumBootstrapDurationMs,
  );
  const parser = new RecordedRtspParser();

  while (true) {
    for await (const packet of parser.parse(segment, byteOffset, options.signal)) {
      if (options.signal?.aborted) throw options.signal.reason;
      for (const message of processor.processPacket(packet)) yield message;
    }

    const next = await options.source.nextSegment(segment.ref, options.signal);
    // An end, session change, or large gap releases the final complete unit.
    // Continuous segments can split a FU-A, so keep its assembler state intact.
    if (
      next === undefined ||
      next.sessionId !== segment.sessionId ||
      next.startTimeMs - segment.endTimeMs > maximumGapMs
    ) {
      for (const message of processor.flush()) yield message;
    }
    if (next === undefined) {
      processor.assertReadyAtEnd();
      yield { kind: 'end', reason: 'end-of-recording' };
      return;
    }
    if (next.sessionId !== segment.sessionId) {
      if (!processor.isReady) {
        throw new PlaybackMediaError('recording_gap', 'Playback reached an incompatible session.');
      }
      yield { kind: 'end', reason: 'incompatible-session' };
      return;
    }
    if (next.startTimeMs - segment.endTimeMs > maximumGapMs) {
      if (!processor.isReady) {
        throw new PlaybackMediaError('recording_gap', 'Playback reached a recording gap.');
      }
      yield { kind: 'end', reason: 'recording-gap' };
      return;
    }
    segment = next;
    byteOffset = 0;
  }
}
