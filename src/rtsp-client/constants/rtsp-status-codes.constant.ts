/** RTSP response codes that control negotiation and keepalive. */
export const RTSP_STATUS_CODES = {
  success: 200,
  successUpperBound: 300,
  unauthorized: 401,
  methodNotAllowed: 405,
  notImplemented: 501,
} as const;
