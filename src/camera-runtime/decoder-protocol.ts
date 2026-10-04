import type { ExtractedJpegFrame } from '../frame-extractor/rtsp-url-frame-extractor.js';
import type { FrameProfile, WireError } from './protocol.js';
export type DecoderCommand =
  | { type: 'start'; url: string; cameraId: string; profile: FrameProfile; maximumFrameBytes: number }
  | { type: 'ack' }
  | { type: 'stop' };
export type DecoderMessage =
  | { type: 'ready' }
  | { type: 'frame'; frame: ExtractedJpegFrame }
  | { type: 'error'; error: WireError };
