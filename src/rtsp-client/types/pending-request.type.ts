import { type RtspMessage } from '../../rtsp-parser/index.js';

/** Request awaiting a camera response with the matching CSeq. */
export type PendingRequest = {
  /** Complete the request with the matching RTSP response. */
  readonly resolve: (response: RtspMessage) => void;
  /** Fail the request after timeout, write error, or disconnect. */
  readonly reject: (error: Error) => void;
  /** Timer limiting the wait for this response. */
  readonly timeout: NodeJS.Timeout;
};
