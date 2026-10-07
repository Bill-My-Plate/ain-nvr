import { PlaybackProtocolError } from './playback-protocol-error.class.js';

export function requireUnsignedSafeInteger(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new PlaybackProtocolError(`${name} is outside its unsigned integer range.`);
  }
}
