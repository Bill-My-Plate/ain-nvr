export type AinNvrErrorCode =
  | 'rtsp_authentication_failed'
  | 'rtsp_unsupported_transport'
  | 'media_timeout'
  | 'unsupported_codec'
  | 'corrupt_media'
  | 'recording_gap'
  | 'no_decoder_configuration'
  | 'no_sync_frame'
  | 'recording_writer_failed'
  | 'recorded_source_failed'
  | 'decoder_unavailable';

export class AinNvrError extends Error {
  override readonly name: string = 'AinNvrError';

  constructor(
    readonly code: AinNvrErrorCode,
    message: string,
    options: {
      readonly cause?: unknown;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.details = options.details;
  }

  readonly details: Readonly<Record<string, unknown>> | undefined;
}
