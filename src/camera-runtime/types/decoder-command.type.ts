import type { FrameProfile } from './frame-profile.type.js';
/**
 * Command sent from the camera worker to its decoder process.
 */
export type DecoderCommand =
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'start';
      /** RTSP URL used to reach the stream or playback server. */
      url: string;
      /**
       * Stable identifier of the camera associated with this value.
       */
      cameraId: string;
      /** Frame decoding and sampling profile. */
      profile: FrameProfile;
      /** Maximum frame measured in bytes. */
      maximumFrameBytes: number;
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'ack';
    }
  | {
      /** Discriminant or media type used to interpret this value. */
      type: 'stop';
    };
