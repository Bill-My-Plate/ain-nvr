export type RtspParseErrorCode =
  | 'incomplete_input'
  | 'interleaved_packet_too_large'
  | 'invalid_content_length'
  | 'invalid_interleaved_length'
  | 'invalid_interleaved_magic'
  | 'invalid_rtsp_header'
  | 'invalid_rtsp_start_line'
  | 'rtsp_body_too_large'
  | 'rtsp_header_too_large'
  | 'unexpected_interleaved_frame';

export class RtspParseError extends Error {
  override readonly name = 'RtspParseError';

  constructor(
    readonly code: RtspParseErrorCode,
    message: string,
  ) {
    super(message);
  }
}
