





import { type RtspMessage } from '../../rtsp-parser/index.js';



export type PendingRequest = {
  readonly resolve: (response: RtspMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
};
