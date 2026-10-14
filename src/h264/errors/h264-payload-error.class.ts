/**
 * Reports malformed or unsupported H.264 RTP payloads.
 */
export class H264PayloadError extends Error {
  override readonly name = 'H264PayloadError';
}
