/**
 * Persisted codec string and dimensions for WebCodecs playback.
 */
export type StoredWebCodecInfo = {
  /** Codec identifier for the media track. */
  codec: string;
  /** Coded frame width in pixels before display cropping. */
  codedWidth: number;
  /** Coded frame height in pixels before display cropping. */
  codedHeight: number;
  /** H.264 bitstream framing expected by the decoder. */
  bitstreamFormat: 'annexb';
};
