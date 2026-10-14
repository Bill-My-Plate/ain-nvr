import { type RtspInterleavedFrame } from './rtsp-interleaved-frame.interface.js';
import { type RtspMessage } from './rtsp-message.interface.js';
/**
 * Either a complete RTSP message or an interleaved media frame.
 */
export type RtspStreamItem = RtspMessage | RtspInterleavedFrame;
