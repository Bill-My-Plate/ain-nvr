import type { RtspStartLine } from "./rtsp-start-line.type.js";
import type { RtspHeaders } from "../services/rtsp-headers.class.js";

export interface RtspMessage {
  readonly type: "rtsp-message";
  readonly startLine: RtspStartLine;
  readonly headers: RtspHeaders;
  readonly body: Buffer;
  readonly rawHeader: Buffer;
}
