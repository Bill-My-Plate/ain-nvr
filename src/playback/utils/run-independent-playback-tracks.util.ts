import type { TrackTimestampedPlaybackItem } from '../types/track-timestamped-playback-item.type.js';
import { PlaybackPacer } from '../services/playback-pacer.class.js';

/**
 * Mirrors Scrypted's separate video and audio RTP schedulers. Video provides
 * read-side pacing, while audio runs on its own serial lane and cannot block
 * an earlier video timestamp. Both lanes share the pacer's wall-clock origin.
 */
export async function runIndependentPlaybackTracks<T extends TrackTimestampedPlaybackItem>(
  pacer: PlaybackPacer<T>,
  source: AsyncIterable<T>,
  send: (item: T) => Promise<void> | void,
  signal: AbortSignal,
  maximumPendingAudioItems = 512,
): Promise<void> {
  if (!Number.isSafeInteger(maximumPendingAudioItems) || maximumPendingAudioItems <= 0) {
    throw new RangeError('maximumPendingAudioItems must be a positive safe integer.');
  }

  // Playback access units are relative to the selected decoder-safe keyframe.
  pacer.start(0);
  const laneAbort = new AbortController();
  const laneSignal = AbortSignal.any([signal, laneAbort.signal]);
  let videoTail = Promise.resolve();
  let audioTail = Promise.resolve();
  const pendingAudio: Promise<void>[] = [];

  try {
    for await (const item of source) {
      if (laneSignal.aborted) {
        throw laneSignal.reason;
      }
      if (item.kind === 'video') {
        // Match Scrypted's awaited video scheduler queue: at most one video
        // access unit is being paced while the recording reader moves ahead.
        await videoTail;
        videoTail = pacer.schedule(item, send, laneSignal);
        void videoTail.catch(() => {});
        continue;
      }

      const scheduled = audioTail.then(() => pacer.schedule(item, send, laneSignal));
      audioTail = scheduled;
      void scheduled.catch(() => {});
      pendingAudio.push(scheduled);
      if (pendingAudio.length >= maximumPendingAudioItems) {
        await pendingAudio.shift();
      }
    }
    await Promise.all([videoTail, audioTail]);
  } catch (error) {
    laneAbort.abort(error);
    await Promise.allSettled([videoTail, audioTail]);
    throw error;
  }
}
