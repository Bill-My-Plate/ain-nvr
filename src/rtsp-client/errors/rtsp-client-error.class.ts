/** RTSP connection, negotiation, or response failure; statusCode holds a server response code when available. */
export class RtspClientError extends Error {
  override readonly name = 'RtspClientError';

  /** Create a failure with an optional RTSP response status code. */
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}
