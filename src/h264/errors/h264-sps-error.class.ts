/**
 * Reports invalid H.264 SPS bitstream data.
 */
export class H264SpsError extends Error {
  override readonly name = 'H264SpsError';
}
