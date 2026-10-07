import type { MediaPacket } from '../../media/index.js';








export interface RecordingWriteRequest {
  readonly packet: MediaPacket;
  readonly boundaryBefore: boolean;
  readonly discontinuityBefore: boolean;
}
