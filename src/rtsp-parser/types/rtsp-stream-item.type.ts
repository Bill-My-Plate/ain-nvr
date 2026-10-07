
import { type RtspInterleavedFrame } from './rtsp-interleaved-frame.interface.js';
import { type RtspMessage } from './rtsp-message.interface.js';



export type RtspStreamItem = RtspMessage | RtspInterleavedFrame;
