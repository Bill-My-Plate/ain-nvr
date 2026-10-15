import { randomBytes } from 'node:crypto';
import net, { type Server, type Socket } from 'node:net';

import type { MediaPacket, TrackDescription } from '../../media/index.js';
import { RtspParser } from '../../rtsp-parser/index.js';

import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import type { BridgeClient } from '../types/bridge-client.type.js';
import type { BufferedFrame } from '../types/buffered-frame.type.js';
import type { RtspLoopbackBridgeOptions } from '../types/rtsp-loopback-bridge-options.interface.js';
import type { RtspLoopbackBridgeStatus } from '../types/rtsp-loopback-bridge-status.interface.js';
import { createLoopbackSdp } from '../utils/create-loopback-sdp.util.js';
import { h264Track } from '../utils/h264-track.util.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { interleavedFrame } from '../utils/rtsp-loopback-bridge-interleaved-frame.util.js';
import { RtspLoopbackMediaState } from './rtsp-loopback-media-state.class.js';
import { RtspLoopbackRequestHandler } from './rtsp-loopback-request-handler.class.js';

/** Serves a live packet source to local RTSP clients over interleaved TCP. */
export class RtspLoopbackBridge {
  private readonly maximumClientQueuedBytes: number;
  private readonly maximumClients: number;
  private readonly server: Server;
  private readonly media: RtspLoopbackMediaState;
  private readonly requests: RtspLoopbackRequestHandler;
  private readonly clients = new Set<BridgeClient>();
  private readonly token = randomBytes(STREAM_ADAPTER_CONSTANTS.loopbackTokenBytes).toString('hex');
  private unsubscribe: (() => void) | undefined;
  private forwardedPackets = 0;
  private droppedClients = 0;
  private running = false;
  private stopped = false;
  private startPromise: Promise<string> | undefined;
  private stopPromise: Promise<void> | undefined;
  private urlValue: string | undefined;

  /** Validates limits and wires the media, control, and socket owners together. */
  public constructor(private readonly options: RtspLoopbackBridgeOptions) {
    const maximumPrerollBytes = positiveInteger(
      options.maximumPrerollBytes,
      STREAM_ADAPTER_CONSTANTS.maximumPrerollBytes,
      'maximumPrerollBytes',
    );
    const maximumPrerollPackets = positiveInteger(
      options.maximumPrerollPackets,
      STREAM_ADAPTER_CONSTANTS.maximumPrerollPackets,
      'maximumPrerollPackets',
    );
    this.maximumClientQueuedBytes = positiveInteger(
      options.maximumClientQueuedBytes,
      STREAM_ADAPTER_CONSTANTS.maximumClientQueuedBytes,
      'maximumClientQueuedBytes',
    );
    this.maximumClients = positiveInteger(
      options.maximumClients,
      STREAM_ADAPTER_CONSTANTS.defaultMaximumClients,
      'maximumClients',
    );
    this.media = new RtspLoopbackMediaState(
      maximumPrerollBytes,
      maximumPrerollPackets,
      () => this.disconnectClients(),
    );
    this.requests = new RtspLoopbackRequestHandler(
      this.token,
      () => this.urlValue,
      () => createLoopbackSdp(this.media.track as TrackDescription, this.media.codecConfiguration),
      (client) => this.replayPreroll(client),
    );
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.on('error', (error) => this.reportError(error));
  }

  /** Returns the local RTSP URL after startup. */
  public get url(): string | undefined {
    return this.urlValue;
  }

  /** Returns a snapshot of listener, client, and media forwarding state. */
  public get status(): RtspLoopbackBridgeStatus {
    return {
      running: this.running,
      clientCount: this.clients.size,
      playingClientCount: [...this.clients].filter((client) => client.playing).length,
      prerollBytes: this.media.prerollBytes,
      prerollPackets: this.media.prerollPackets,
      forwardedPackets: this.forwardedPackets,
      droppedClients: this.droppedClients,
    };
  }

  /** Starts the loopback listener once and returns its token-scoped URL. */
  public start(): Promise<string> {
    if (this.stopped) return Promise.reject(new Error('RTSP bridge has been stopped.'));
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  /** Unsubscribes from source media and closes every client and the listener. */
  public stop(): Promise<void> {
    this.stopPromise ??= this.stopInternal();
    return this.stopPromise;
  }

  /** Releases resources after any pending startup finishes. */
  private async stopInternal(): Promise<void> {
    this.stopped = true;
    await this.startPromise?.catch(() => undefined);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.disconnectClients();
    this.clients.clear();
    this.media.clearPreroll();
    if (this.server.listening) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
    this.running = false;
    this.urlValue = undefined;
  }

  /** Selects the H.264 track, subscribes to packets, and opens a local port. */
  private async startInternal(): Promise<string> {
    const track = h264Track(this.options.source.tracks);
    if (track === undefined) throw new Error('RTSP bridge source has no H.264 video track.');
    this.media.setTrack(track, false);
    this.unsubscribe = this.options.source.subscribeMediaPackets((packet) => this.capture(packet));
    try {
      await new Promise<void>((resolve, reject) => {
        const failed = (error: Error): void => reject(error);
        this.server.once('error', failed);
        this.server.listen(0, '127.0.0.1', () => {
          this.server.removeListener('error', failed);
          resolve();
        });
      });
      const address = this.server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('RTSP bridge did not receive a TCP port.');
      }
      this.urlValue = `rtsp://127.0.0.1:${address.port}/${this.token}`;
      this.running = true;
      return this.urlValue;
    } catch (error) {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      throw error;
    }
  }

  /** Accepts a client within the configured limit and attaches its parser. */
  private accept(socket: Socket): void {
    socket.setNoDelay(true);
    if (this.clients.size >= this.maximumClients) {
      this.droppedClients += 1;
      socket.destroy();
      return;
    }
    const client: BridgeClient = {
      socket,
      parser: new RtspParser(),
      sessionId: randomBytes(STREAM_ADAPTER_CONSTANTS.loopbackSessionIdBytes).toString('hex'),
      rtpChannel: 0,
      rtcpChannel: 1,
      playing: false,
    };
    this.clients.add(client);
    socket.on('data', (chunk: Buffer) => this.receive(client, chunk));
    socket.on('error', (error) => this.reportError(error));
    socket.on('close', () => this.clients.delete(client));
  }

  /**
   * Parses incoming client bytes and delegates complete RTSP messages.
   * @param chunk Arbitrary TCP stream bytes, possibly a partial request,
   * multiple requests, or a four-byte interleaved header plus packet bytes.
   */
  private receive(client: BridgeClient, chunk: Buffer): void {
    try {
      for (const item of client.parser.push(chunk)) {
        if (item.type === 'interleaved-frame') continue;
        this.requests.handle(client, item);
      }
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error(String(error)));
      client.socket.destroy();
    }
  }

  /** Buffers one source packet, then forwards it to playing clients. */
  private capture(packet: MediaPacket): void {
    const frame = this.media.capture(packet);
    if (frame === undefined) return;
    for (const client of this.clients) {
      if (client.playing) this.sendFrame(client, frame);
    }
  }

  /** Replays bounded preroll after the PLAY response is sent. */
  private replayPreroll(client: BridgeClient): void {
    for (const frame of this.media.prerollFrames) this.sendFrame(client, frame);
  }

  /**
   * Sends one complete source RTP or RTCP packet on the negotiated channel.
   * @param frame Its payload is a complete variable-length RTP packet with a
   * 12-byte fixed header, or RTCP packet with a four-byte common header. This
   * method adds the four-byte RTSP interleaved prefix before writing.
   */
  private sendFrame(client: BridgeClient, frame: BufferedFrame): void {
    if (client.socket.destroyed) return;
    const raw = interleavedFrame(
      frame.isRtcp ? client.rtcpChannel : client.rtpChannel,
      frame.payload,
    );
    if (client.socket.writableLength + raw.length > this.maximumClientQueuedBytes) {
      this.droppedClients += 1;
      client.socket.destroy();
      return;
    }
    client.socket.write(raw);
    this.forwardedPackets += 1;
  }

  /** Closes clients whose transport no longer matches the source track. */
  private disconnectClients(): void {
    for (const client of this.clients) client.socket.destroy();
  }

  /** Reports socket or parser failures through the caller's error callback. */
  private reportError(error: Error): void {
    this.options.onError?.(error);
  }
}
