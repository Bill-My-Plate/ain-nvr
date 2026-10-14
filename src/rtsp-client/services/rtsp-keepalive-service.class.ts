import type { Socket } from 'node:net';
import type { RtspMessage } from '../../rtsp-parser/index.js';
import { RTSP_CLIENT_DEFAULTS } from '../constants/rtsp-client-defaults.constant.js';
import { RTSP_STATUS_CODES } from '../constants/rtsp-status-codes.constant.js';
import { RtspClientError } from '../errors/rtsp-client-error.class.js';
import { publicMethods } from '../utils/public-methods.util.js';
import { RtspRequestService } from './rtsp-request-service.class.js';
/** Keep an RTSP session alive and try the other supported method on rejection. */
export class RtspKeepaliveService {
  private timer: NodeJS.Timeout | undefined;
  private method = 'OPTIONS';
  /** Use the request owner and current socket without taking over connection cleanup. */
  public constructor(
    private readonly requestUrl: string,
    private readonly configuredIntervalMs: number | undefined,
    private readonly requests: RtspRequestService,
    private readonly socketProvider: () => Socket | undefined,
  ) {}

  /** Choose GET_PARAMETER when OPTIONS advertises it; otherwise use OPTIONS. */
  public configure(optionsResponse: RtspMessage): void {
    const methods = publicMethods(optionsResponse);
    this.method = methods.has('GET_PARAMETER') ? 'GET_PARAMETER' : 'OPTIONS';
  }

  /** Schedule session keepalives and fall back between OPTIONS and GET_PARAMETER when the camera rejects a method. */
  public start(sessionId: string, sessionTimeoutSeconds: number | undefined): void {
    const interval =
      this.configuredIntervalMs ??
      Math.max(
        RTSP_CLIENT_DEFAULTS.minimumKeepaliveMs,
        Math.floor(
          (sessionTimeoutSeconds ?? RTSP_CLIENT_DEFAULTS.fallbackSessionTimeoutSeconds) *
            RTSP_CLIENT_DEFAULTS.keepaliveMsPerSessionSecond,
        ),
      );
    this.timer = setInterval(() => {
      if (this.requests.hasPendingRequests) {
        return;
      }
      void this.requests
        .request(this.method, this.requestUrl, {
          headers: { Session: sessionId },
        })
        .catch((error: unknown) => {
          if (
            error instanceof RtspClientError &&
            (error.statusCode === RTSP_STATUS_CODES.methodNotAllowed ||
              error.statusCode === RTSP_STATUS_CODES.notImplemented)
          ) {
            // Some cameras advertise a method but reject it when used for keepalive.
            const fallback = this.method === 'GET_PARAMETER' ? 'OPTIONS' : 'GET_PARAMETER';
            void this.requests
              .request(fallback, this.requestUrl, {
                headers: { Session: sessionId },
              })
              .then(() => {
                this.method = fallback;
              })
              .catch((fallbackError: unknown) => {
                this.socketProvider()?.destroy(
                  fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)),
                );
              });
            return;
          }
          this.socketProvider()?.destroy(error instanceof Error ? error : new Error(String(error)));
        });
    }, interval);
    this.timer.unref();
  }

  /** Cancel the session keepalive timer. */
  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
