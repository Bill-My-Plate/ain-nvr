







import { type SdpDescription } from '../rtsp-parser/index.js';

import type { RtspVideoTrack } from './rtsp-video-track.interface.js';
import type { RtspAudioTrack } from './rtsp-audio-track.interface.js';

export interface RtspClientSession {
  readonly sdp: string;
  readonly description: SdpDescription;
  readonly video: RtspVideoTrack;
  readonly audio?: RtspAudioTrack;
  readonly sessionId: string;
  readonly sessionTimeoutSeconds?: number;
}
