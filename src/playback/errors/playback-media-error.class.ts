import { AinNvrError } from '../../shared/index.js';
/**
 * Reports unsupported or invalid media encountered during playback.
 */
export class PlaybackMediaError extends AinNvrError {
  override readonly name = 'PlaybackMediaError';
}
