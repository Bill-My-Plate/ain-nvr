
import type { FrameProfile } from './frame-profile.type.js';

export type DecoderCommand =
  | { type: 'start'; url: string; cameraId: string; profile: FrameProfile; maximumFrameBytes: number }
  | { type: 'ack' }
  | { type: 'stop' };
