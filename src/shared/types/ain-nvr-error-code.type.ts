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
