
import type { PlaybackMessage } from '../../playback/index.js';



import type { PlaybackVideoMessage } from '../types/playback-video-message.type.js';

export async function* prependMessage(
  first: PlaybackVideoMessage,
  remaining: AsyncGenerator<PlaybackMessage>,
): AsyncGenerator<PlaybackMessage> {
  yield first;
  yield* remaining;
}
