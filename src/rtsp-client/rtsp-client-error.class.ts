









export class RtspClientError extends Error {
  override readonly name = 'RtspClientError';

  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}
