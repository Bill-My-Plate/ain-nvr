import dgram, { type Socket } from 'node:dgram';

import type { MediaPacket, RtspStreamSession } from './rtsp-stream-session.js';

export interface RtpUdpForwarderOptions {
  readonly host?: string;
  readonly port: number;
  readonly maximumPendingPackets?: number;
  readonly socketFactory?: () => Socket;
  readonly onError?: (error: Error) => void;
}

export interface RtpUdpForwarderStatus {
  readonly forwardedPackets: number;
  readonly droppedPackets: number;
  readonly pendingPackets: number;
}

export class RtpUdpForwarder {
  private readonly host: string;
  private readonly maximumPendingPackets: number;
  private readonly socket: Socket;
  private unsubscribe: (() => void) | undefined;
  private pendingPackets = 0;
  private forwardedPackets = 0;
  private droppedPackets = 0;
  private stopped = false;

  constructor(private readonly options: RtpUdpForwarderOptions) {
    if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65_535) {
      throw new RangeError('port must be between 1 and 65535.');
    }
    this.maximumPendingPackets = options.maximumPendingPackets ?? 1_024;
    if (!Number.isSafeInteger(this.maximumPendingPackets) || this.maximumPendingPackets <= 0) {
      throw new RangeError('maximumPendingPackets must be a positive safe integer.');
    }
    this.host = options.host ?? '127.0.0.1';
    this.socket = options.socketFactory?.() ?? dgram.createSocket('udp4');
  }

  start(session: RtspStreamSession): void {
    if (this.unsubscribe !== undefined) throw new Error('RTP forwarder is already started.');
    this.unsubscribe = session.subscribeMediaPackets((packet) => this.forward(packet));
  }

  get status(): RtpUdpForwarderStatus {
    return {
      forwardedPackets: this.forwardedPackets,
      droppedPackets: this.droppedPackets,
      pendingPackets: this.pendingPackets,
    };
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await new Promise<void>((resolve) => {
      try {
        this.socket.close(() => resolve());
      } catch {
        // A datagram socket that never sent a packet was never bound.
        resolve();
      }
    });
  }

  private forward(packet: MediaPacket): void {
    if (this.stopped || packet.track?.mediaType !== 'video' || packet.rtp === undefined) return;
    if (this.pendingPackets >= this.maximumPendingPackets) {
      this.droppedPackets += 1;
      return;
    }
    this.pendingPackets += 1;
    this.socket.send(packet.frame.payload, this.options.port, this.host, (error) => {
      this.pendingPackets -= 1;
      if (error !== null) {
        this.droppedPackets += 1;
        this.options.onError?.(error);
      } else {
        this.forwardedPackets += 1;
      }
    });
  }
}
