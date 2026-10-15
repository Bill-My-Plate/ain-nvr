import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import type { PlaybackRtspReplayOptions } from '../types/playback-rtsp-replay-options.type.js';
import { throwIfPlaybackAborted } from './throw-if-playback-aborted.util.js';

/**
 * Packetizes playback media against one wall-clock origin and sends it to a
 * client that has completed RTSP PLAY. The video end time is exclusive; audio
 * at or beyond that time is skipped while replay drains to the next video.
 */
export async function replayPlaybackRtsp(
  options: PlaybackRtspReplayOptions,
): Promise<void> {
  let sentVideo = false;

  for await (const message of options.playback) {
    throwIfPlaybackAborted(options.signal);
    if (message.kind !== 'video' && message.kind !== 'audio') continue;
    const atOrAfterEnd =
      options.endTimeMs !== undefined &&
      message.wallClockTimeMs >= options.endTimeMs;
    if (message.kind === 'video' && atOrAfterEnd) break;
    if (message.kind === 'audio' && atOrAfterEnd) continue;

    // Both tracks use the first video frame as their RTP clock origin.
    const timestampUs = Math.max(
      0,
      Math.round(
        (message.wallClockTimeMs - options.actualStartTimeMs) *
          STREAM_ADAPTER_CONSTANTS.millisecondsPerSecond,
      ),
    );

    if (message.kind === 'video') {
      const packets = options.videoPacketizer.packetizeH264(
        message.data,
        timestampUs,
      );
      for (const packet of packets) await options.server.sendVideo(packet);
      if (packets.length > 0) sentVideo = true;
      continue;
    }

    if (options.audioPacketizer !== undefined) {
      if (
        message.sampleFormat !== 's16le' ||
        message.sampleRate !== options.audioSampleRate ||
        message.channels !== 1
      ) {
        throw new Error('Playback audio format changed during RTSP bridging.');
      }
      for (const packet of options.audioPacketizer.packetizePcmS16Le(
        message.data,
        timestampUs,
      )) {
        await options.server.sendAudio(packet);
      }
    }
  }

  if (!sentVideo) {
    throw new Error('Playback interval contains no exportable video frames.');
  }
}
