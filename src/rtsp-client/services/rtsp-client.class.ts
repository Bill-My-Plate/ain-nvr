import { EventEmitter, once } from "node:events";
import net, { type Socket } from "node:net";
import tls from "node:tls";
import { RTSP_CLIENT_DEFAULTS } from "../constants/rtsp-client-defaults.constant.js";
import { RTSP_STATUS_CODES } from "../constants/rtsp-status-codes.constant.js";
import { RTSP_TRANSPORT } from "../constants/rtsp-transport.constant.js";
import { RTSP_PROTOCOL_VERSION } from "../constants/rtsp-protocol-version.constant.js";
import { RTSP_PLAY_RANGE } from "../constants/rtsp-play-range.constant.js";
import { AinNvrError } from "../../shared/index.js";
import { type RtspCredentials } from "../types/rtsp-credentials.interface.js";
import type { RtspInterleavedFrame } from "../../rtsp-parser/index.js";
import { type RtspMessage } from "../../rtsp-parser/index.js";
import { RtspParser } from "../../rtsp-parser/index.js";
import {
  parseSdp,
  resolveRtspControlUrl,
  selectG711AudioMedia,
  selectH264VideoMedia,
} from "../../rtsp-parser/index.js";

import type { RtspClientOptions } from "../types/rtsp-client-options.interface.js";
import type { RtspAudioTrack } from "../types/rtsp-audio-track.interface.js";
import type { RtspClientSession } from "../types/rtsp-client-session.interface.js";
import { RtspClientError } from "../errors/rtsp-client-error.class.js";
import { getRtspPort } from "../utils/get-rtsp-port.util.js";
import { positiveInteger } from "../utils/positive-integer.util.js";
import { parseSession } from "../utils/parse-session.util.js";
import { interleavedChannels } from "../utils/interleaved-channels.util.js";
import { RtspRequestService } from "./rtsp-request-service.class.js";
import { RtspKeepaliveService } from "./rtsp-keepalive-service.class.js";
import { RtspMediaWatchdogService } from "./rtsp-media-watchdog-service.class.js";

/** Manage one RTSP 1.0 camera connection, authentication, TCP media negotiation, and frame delivery. */
export class RtspClient extends EventEmitter {
  private readonly parsedUrl: URL;
  private readonly requestUrl: string;
  private readonly connectTimeoutMs: number;
  private readonly socketFactory: (port: number, host: string) => Socket;
  private readonly connectEvent: "connect" | "secureConnect";
  private readonly parser = new RtspParser();
  private readonly requests: RtspRequestService;
  private readonly keepalive: RtspKeepaliveService;
  private readonly mediaWatchdog: RtspMediaWatchdogService;
  private socket: Socket | undefined;
  private sessionId: string | undefined;
  private closing = false;

  /** Validate camera URL and timers, then select a TCP or TLS socket factory. */
  constructor(options: RtspClientOptions) {
    super();
    this.parsedUrl = new URL(options.url);
    if (
      this.parsedUrl.protocol !== "rtsp:" &&
      this.parsedUrl.protocol !== "rtsps:"
    ) {
      throw new RtspClientError("Camera URL must use rtsp:// or rtsps://.");
    }
    if (!this.parsedUrl.hostname) {
      throw new RtspClientError("Camera URL lacks a host.");
    }
    const username = decodeURIComponent(this.parsedUrl.username);
    const password = decodeURIComponent(this.parsedUrl.password);
    const credentials: RtspCredentials | undefined =
      username.length === 0 ? undefined : { username, password };
    const safeUrl = new URL(this.parsedUrl);
    safeUrl.username = "";
    safeUrl.password = "";
    this.requestUrl = safeUrl.toString();
    this.connectTimeoutMs = positiveInteger(
      options.connectTimeoutMs ?? RTSP_CLIENT_DEFAULTS.connectTimeoutMs,
      "connectTimeoutMs",
    );
    const requestTimeoutMs = positiveInteger(
      options.requestTimeoutMs ?? RTSP_CLIENT_DEFAULTS.requestTimeoutMs,
      "requestTimeoutMs",
    );
    const configuredKeepaliveMs =
      options.keepaliveIntervalMs === undefined
        ? undefined
        : positiveInteger(options.keepaliveIntervalMs, "keepaliveIntervalMs");
    const mediaTimeoutMs = positiveInteger(
      options.mediaTimeoutMs ?? RTSP_CLIENT_DEFAULTS.mediaTimeoutMs,
      "mediaTimeoutMs",
    );
    this.connectEvent =
      options.socketFactory === undefined &&
      this.parsedUrl.protocol === "rtsps:"
        ? "secureConnect"
        : "connect";
    this.socketFactory =
      options.socketFactory ??
      (this.parsedUrl.protocol === "rtsps:"
        ? (port, host) => tls.connect({ port, host, servername: host })
        : (port, host) => net.createConnection({ port, host }));
    this.requests = new RtspRequestService(
      () => this.socket,
      credentials,
      requestTimeoutMs,
    );
    this.keepalive = new RtspKeepaliveService(
      this.requestUrl,
      configuredKeepaliveMs,
      this.requests,
      () => this.socket,
    );
    this.mediaWatchdog = new RtspMediaWatchdogService(
      mediaTimeoutMs,
      () => this.socket,
    );
  }

  /** Open the socket, negotiate OPTIONS/DESCRIBE/SETUP/PLAY, and return tracks; close the socket if negotiation fails. */
  public async connect(): Promise<RtspClientSession> {
    if (this.socket !== undefined) {
      throw new RtspClientError("RTSP client is already connected.");
    }
    this.closing = false;
    const port = getRtspPort(this.parsedUrl);
    // Keep this attempt's socket for listeners, timeout, and cleanup across awaits.
    const socket = this.socketFactory(port, this.parsedUrl.hostname);
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.handleData(chunk));
    socket.on("error", (error) => this.handleDisconnect(error));
    socket.on("close", () =>
      this.handleDisconnect(new RtspClientError("RTSP socket closed.")),
    );

    const connectTimeout = setTimeout(() => {
      socket.destroy(new RtspClientError("RTSP connection timed out."));
    }, this.connectTimeoutMs);
    connectTimeout.unref();

    try {
      if (!socket.readyState || socket.connecting) {
        await Promise.race([
          once(socket, this.connectEvent),
          once(socket, "error").then(([error]) => Promise.reject(error)),
        ]);
      }
    } finally {
      clearTimeout(connectTimeout);
    }

    try {
      // Learn whether the camera advertises GET_PARAMETER for keepalives.
      const options = await this.requests.request("OPTIONS", this.requestUrl);
      this.keepalive.configure(options);

      // Discover the SDP tracks before requesting any media channels.
      const describe = await this.requests.request("DESCRIBE", this.requestUrl, {
        headers: { Accept: "application/sdp" },
      });
      const sdp = describe.body.toString("utf8");
      const description = parseSdp(sdp);
      const selected = selectH264VideoMedia(description);
      if (selected === undefined || !selected.media.control) {
        throw new AinNvrError(
          "unsupported_codec",
          "DESCRIBE response has no controlled H.264 video track.",
        );
      }
      const contentBase =
        describe.headers.get("content-base") ??
        describe.headers.get("content-location");
      const controlUrl = resolveRtspControlUrl(
        this.requestUrl,
        selected.media.control,
        description.sessionControl,
        contentBase,
      );

      // Video is required. Negotiate its channels and keep the camera's Session ID.
      const setup = await this.requests.request("SETUP", controlUrl, {
        headers: { Transport: RTSP_TRANSPORT.videoHeader },
      });
      const session = parseSession(setup.headers.get("session"));
      this.sessionId = session.sessionId;
      const videoChannels = interleavedChannels(
        setup.headers.get("transport"),
        RTSP_TRANSPORT.videoRtpChannel,
        RTSP_TRANSPORT.videoRtcpChannel,
      );
      const { rtpChannel, rtcpChannel } = videoChannels;

      // Audio is optional; a camera rejecting audio SETUP must not stop video.
      let audio: RtspAudioTrack | undefined;
      const selectedAudio = selectG711AudioMedia(description);
      if (selectedAudio?.media.control) {
        const audioControlUrl = resolveRtspControlUrl(
          this.requestUrl,
          selectedAudio.media.control,
          description.sessionControl,
          contentBase,
        );
        try {
          const audioSetup = await this.requests.request(
            "SETUP",
            audioControlUrl,
            {
              headers: {
                Session: this.sessionId,
                Transport: RTSP_TRANSPORT.audioHeader,
              },
            },
          );
          const audioChannels = interleavedChannels(
            audioSetup.headers.get("transport"),
            RTSP_TRANSPORT.audioRtpChannel,
            RTSP_TRANSPORT.audioRtcpChannel,
          );
          audio = {
            codec: selectedAudio.codec,
            media: selectedAudio.media,
            rtpMap: selectedAudio.rtpMap,
            controlUrl: audioControlUrl,
            ...audioChannels,
          };
        } catch {
          // Optional audio setup failure does not interrupt video recording.
        }
      }

      // Start media only after all accepted tracks have been SETUP.
      await this.requests.request("PLAY", this.requestUrl, {
        headers: { Session: this.sessionId, Range: RTSP_PLAY_RANGE },
      });
      this.mediaWatchdog.watchChannels([
        rtpChannel,
        ...(audio === undefined ? [] : [audio.rtpChannel]),
      ]);
      this.keepalive.start(session.sessionId, session.timeoutSeconds);
      this.mediaWatchdog.start();
      return {
        sdp,
        description,
        video: {
          media: selected.media,
          rtpMap: selected.rtpMap,
          controlUrl,
          rtpChannel,
          rtcpChannel,
        },
        ...(audio === undefined ? {} : { audio }),
        sessionId: this.sessionId,
        ...(session.timeoutSeconds === undefined
          ? {}
          : { sessionTimeoutSeconds: session.timeoutSeconds }),
      };
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  /** Stop timers, attempt TEARDOWN, and close the socket even if TEARDOWN fails. */
  public async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.keepalive.stop();
    this.mediaWatchdog.stop();
    const socket = this.socket;
    if (socket === undefined) {
      return;
    }
    if (!socket.destroyed && this.sessionId !== undefined) {
      try {
        await this.requests.request("TEARDOWN", this.requestUrl, {
          headers: { Session: this.sessionId },
          allowAuthRetry: false,
        });
      } catch {
        // Socket shutdown still proceeds when a camera ignores TEARDOWN.
      }
    }
    socket.end();
    if (!socket.destroyed) {
      await Promise.race([
        once(socket, "close"),
        new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            socket.destroy();
            resolve();
          }, RTSP_CLIENT_DEFAULTS.closeGraceMs);
          timeout.unref();
        }),
      ]);
    }
    this.socket = undefined;
  }

  /** Pause socket reads to apply downstream backpressure. */
  public pauseMedia(): void {
    this.socket?.pause();
  }

  /** Resume socket reads when downstream backpressure clears. */
  public resumeMedia(): void {
    this.socket?.resume();
  }

  /** Pass an arbitrary TCP or TLS byte chunk to the incremental parser. It may contain partial or multiple RTSP messages and interleaved frames. Each frame has a four-byte header: dollar marker, one-byte channel, and two-byte big-endian payload length. */
  private handleData(chunk: Buffer): void {
    try {
      // One socket event can produce zero, one, or several parser items.
      for (const item of this.parser.push(chunk)) {
        if (item.type === "interleaved-frame") {
          this.mediaWatchdog.noteFrame(item.channel);
          this.emit("interleaved", item as RtspInterleavedFrame);
          continue;
        }
        if (item.startLine.type === "request") {
          this.respondToServerRequest(item);
          continue;
        }
        this.requests.acceptResponse(item);
      }
    } catch (error) {
      this.socket?.destroy(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** Acknowledge a camera-initiated RTSP request using its CSeq when present. */
  private respondToServerRequest(request: RtspMessage): void {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return;
    }
    const cseq = request.headers.get("cseq");
    socket.write(
      Buffer.from(
        `${RTSP_PROTOCOL_VERSION} ${RTSP_STATUS_CODES.success} OK\r\n${cseq === undefined ? "" : `CSeq: ${cseq}\r\n`}Content-Length: ${RTSP_CLIENT_DEFAULTS.emptyBodyLength}\r\n\r\n`,
        "ascii",
      ),
    );
  }

  /** Stop timers, reject pending requests, and emit disconnect unless close was requested. */
  private handleDisconnect(error: Error): void {
    this.keepalive.stop();
    this.mediaWatchdog.stop();
    this.requests.rejectPending(error);
    if (!this.closing) {
      this.emit("disconnect", error);
    }
  }
}
