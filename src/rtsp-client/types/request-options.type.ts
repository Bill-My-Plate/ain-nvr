/** Headers, body, and retry policy for one RTSP request. */
export type RequestOptions = {
  /** Additional headers to send with the RTSP request. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Complete RTSP body as raw bytes, with no fixed layout; its byte count becomes Content-Length. */
  readonly body?: Buffer;
  /** Allow a 401 response to trigger authentication retries. */
  readonly allowAuthRetry?: boolean;
};
