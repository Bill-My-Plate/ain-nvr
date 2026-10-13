import type { Socket } from "node:net";
import type { RtspMessage } from "../../rtsp-parser/index.js";
import { RTSP_CLIENT_DEFAULTS } from "../constants/rtsp-client-defaults.constant.js";
import { RTSP_PROTOCOL_VERSION } from "../constants/rtsp-protocol-version.constant.js";
import { RTSP_STATUS_CODES } from "../constants/rtsp-status-codes.constant.js";
import { RTSP_USER_AGENT } from "../constants/rtsp-user-agent.constant.js";
import { RtspClientError } from "../errors/rtsp-client-error.class.js";
import type { DigestAuthorizationState } from "../types/digest-authorization-state.interface.js";
import type { PendingRequest } from "../types/pending-request.type.js";
import type { RequestOptions } from "../types/request-options.type.js";
import type { RtspAuthChallenge } from "../types/rtsp-auth-challenge.type.js";
import type { RtspCredentials } from "../types/rtsp-credentials.interface.js";
import { createRtspAuthorization } from "../utils/create-rtsp-authorization.util.js";
import { parseRtspAuthChallenge } from "../utils/parse-rtsp-auth-challenge.util.js";

/** Own CSeq, authentication retries, and pending RTSP responses for one client. */
export class RtspRequestService {
  private readonly pending = new Map<number, PendingRequest>();
  private sequence = 0;
  private authChallenge: RtspAuthChallenge | undefined;
  private digestState: DigestAuthorizationState | undefined;

  /** Keep access to the active socket without owning its lifecycle. */
  constructor(
    private readonly socketProvider: () => Socket | undefined,
    private readonly credentials: RtspCredentials | undefined,
    private readonly requestTimeoutMs: number,
  ) {}

  /** Whether any RTSP response is still outstanding. */
  public get hasPendingRequests(): boolean {
    return this.pending.size > 0;
  }

  /** Send an RTSP method, handle supported authentication challenges, and require a successful response. */
  public async request(
    method: string,
    uri: string,
    options: RequestOptions = {},
  ): Promise<RtspMessage> {
    let response: RtspMessage | undefined;
    const maximumAttempts =
      options.allowAuthRetry === false
        ? RTSP_CLIENT_DEFAULTS.singleRequestAttempt
        : RTSP_CLIENT_DEFAULTS.authenticatedRequestAttempts;
    // Each 401 challenge updates authorization for the next CSeq request.
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      let authorization: string | undefined;
      if (this.authChallenge !== undefined && this.credentials !== undefined) {
        const created = createRtspAuthorization(
          this.authChallenge,
          this.credentials,
          method,
          uri,
          this.digestState,
        );
        authorization = created.header;
        this.digestState = created.state;
      }
      response = await this.requestOnce(method, uri, options, authorization);
      if (response.startLine.type !== "response") {
        throw new RtspClientError(
          "Camera returned an RTSP request where a response was expected.",
        );
      }
      if (response.startLine.statusCode !== RTSP_STATUS_CODES.unauthorized)
        break;
      if (this.credentials === undefined) {
        throw new RtspClientError(
          "Camera requires credentials.",
          RTSP_STATUS_CODES.unauthorized,
        );
      }
      const authenticate = response.headers.get("www-authenticate");
      if (!authenticate) {
        throw new RtspClientError(
          "Authentication response lacks WWW-Authenticate.",
          RTSP_STATUS_CODES.unauthorized,
        );
      }
      this.authChallenge = parseRtspAuthChallenge(authenticate);
      this.digestState = undefined;
    }
    if (response === undefined) {
      throw new RtspClientError(`RTSP ${method} produced no response.`);
    }

    if (
      response.startLine.type !== "response" ||
      response.startLine.statusCode < RTSP_STATUS_CODES.success ||
      response.startLine.statusCode >= RTSP_STATUS_CODES.successUpperBound
    ) {
      const status =
        response.startLine.type === "response"
          ? response.startLine.statusCode
          : undefined;
      throw new RtspClientError(
        `RTSP ${method} failed${status === undefined ? "" : ` with ${status}`}.`,
        status,
      );
    }
    return response;
  }

  /** Write one RTSP request and match its response by CSeq. The optional body is complete raw bytes; Content-Length counts its bytes. */
  private requestOnce(
    method: string,
    uri: string,
    options: RequestOptions,
    authorization?: string,
  ): Promise<RtspMessage> {
    const socket = this.socketProvider();
    if (socket === undefined || socket.destroyed) {
      return Promise.reject(
        new RtspClientError("RTSP socket is not connected."),
      );
    }
    const cseq = ++this.sequence;
    const body = options.body ?? Buffer.alloc(0);
    const headers: Record<string, string> = {
      CSeq: String(cseq),
      "User-Agent": RTSP_USER_AGENT,
      ...(options.headers ?? {}),
      ...(authorization === undefined ? {} : { Authorization: authorization }),
      ...(body.length === 0 ? {} : { "Content-Length": String(body.length) }),
    };
    const head = Buffer.from(
      `${method} ${uri} ${RTSP_PROTOCOL_VERSION}\r\n${Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("")}\r\n`,
      "utf8",
    );

    return new Promise<RtspMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(cseq);
        reject(new RtspClientError(`RTSP ${method} request timed out.`));
      }, this.requestTimeoutMs);
      timeout.unref();
      this.pending.set(cseq, { resolve, reject, timeout });
      socket.write(
        body.length === 0 ? head : Buffer.concat([head, body]),
        (error) => {
          if (error) {
            clearTimeout(timeout);
            this.pending.delete(cseq);
            reject(error);
          }
        },
      );
    });
  }

  /** Resolve a pending request when a response has a matching CSeq header. */
  public acceptResponse(response: RtspMessage): void {
    const rawSequence = response.headers.get("cseq");
    const cseq = rawSequence === undefined ? Number.NaN : Number(rawSequence);
    const pending = this.pending.get(cseq);
    if (pending !== undefined) {
      clearTimeout(pending.timeout);
      this.pending.delete(cseq);
      pending.resolve(response);
    }
  }

  /** Fail and clear every request still waiting when the socket disconnects. */
  public rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
