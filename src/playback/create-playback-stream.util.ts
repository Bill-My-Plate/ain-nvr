import type { H264CodecConfiguration } from '../h264/index.js';

import { RecordedRtspParser } from '../recorded-stream-parser/index.js';
import { H264AccessUnitAssembler, type H264AccessUnit } from '../h264/index.js';
import { createG711AccessUnit } from './create-g711-access-unit.util.js';
import { type PcmAudioAccessUnit } from './pcm-audio-access-unit.interface.js';

import type { PlaybackMessage } from './playback-message.type.js';
import type { PlaybackOptions } from './playback-options.interface.js';
import { PlaybackMediaError } from './playback-media-error.class.js';
import { sameConfiguration } from './same-configuration.util.js';

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
