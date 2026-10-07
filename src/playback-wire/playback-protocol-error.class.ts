export class PlaybackProtocolError extends Error {
  override readonly name = 'PlaybackProtocolError';

  constructor(
    message: string,
    readonly closeCode = 1002,
  ) {
    super(message);
  }
}
