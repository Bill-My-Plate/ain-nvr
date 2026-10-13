import type { Socket } from "node:net";
import { RTSP_CLIENT_DEFAULTS } from "../constants/rtsp-client-defaults.constant.js";
import { RtspClientError } from "../errors/rtsp-client-error.class.js";

/** Track RTP activity on negotiated channels and disconnect after media silence. */
export class RtspMediaWatchdogService {
  private readonly mediaRtpChannels = new Set<number>();
  private lastMediaPacketTimeMs = 0;
  private timer: NodeJS.Timeout | undefined;

  /** Keep the media timeout and active socket provider for inactivity checks. */
  constructor(
    private readonly mediaTimeoutMs: number,
    private readonly socketProvider: () => Socket | undefined,
  ) {}

  /** Replace watched RTP channels after SETUP and begin the silence clock. */
  public watchChannels(channels: readonly number[]): void {
    this.mediaRtpChannels.clear();
    for (const channel of channels) this.mediaRtpChannels.add(channel);
    this.lastMediaPacketTimeMs = Date.now();
  }

  /** Record activity only when an interleaved frame uses a negotiated RTP channel. */
  public noteFrame(channel: number): void {
    if (this.mediaRtpChannels.has(channel)) {
      this.lastMediaPacketTimeMs = Date.now();
    }
  }

  /** Disconnect after the configured period without a packet on a negotiated RTP channel. */
  public start(): void {
    const interval = Math.max(
      RTSP_CLIENT_DEFAULTS.minimumWatchdogIntervalMs,
      Math.min(
        RTSP_CLIENT_DEFAULTS.maximumWatchdogIntervalMs,
        Math.floor(
          this.mediaTimeoutMs / RTSP_CLIENT_DEFAULTS.watchdogIntervalDivisor,
        ),
      ),
    );
    this.timer = setInterval(() => {
      if (
        this.lastMediaPacketTimeMs > 0 &&
        Date.now() - this.lastMediaPacketTimeMs >= this.mediaTimeoutMs
      ) {
        this.socketProvider()?.destroy(
          new RtspClientError(
            `No RTP media packets were received for ${this.mediaTimeoutMs} ms.`,
          ),
        );
      }
    }, interval);
    this.timer.unref();
  }

  /** Cancel the RTP inactivity watchdog. */
  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
