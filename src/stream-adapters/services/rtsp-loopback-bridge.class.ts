import { randomBytes } from 'node:crypto';
import net, { type Server, type Socket } from 'node:net';
import type { Logger } from '../../shared/index.js';
import type { TrackDescription } from '../../media/index.js';
import { createH264CodecConfiguration, H264ConfigurationTracker, type H264CodecConfiguration } from '../../h264/index.js';
import { getRtspHeader, type RtspMessage } from '../../rtsp-parser/index.js';
import { RtspMixedParser } from '../../rtsp-parser/index.js';
import type { MediaPacket } from '../../media/index.js';

import { NOOP_LOGGER } from '../constants/noop-logger.constant.js';
import type { RtspLoopbackBridgeOptions } from '../types/rtsp-loopback-bridge-options.interface.js';
import type { RtspLoopbackBridgeStatus } from '../types/rtsp-loopback-bridge-status.interface.js';
import type { BufferedFrame } from '../types/buffered-frame.type.js';
import type { BridgeClient } from '../types/bridge-client.type.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { signedTimestampDelta } from '../utils/signed-timestamp-delta.util.js';
import { h264Track } from '../utils/h264-track.util.js';
import { trackSignature } from '../utils/track-signature.util.js';
import { parseInterleavedChannels } from '../utils/parse-interleaved-channels.util.js';
import { interleavedFrame } from '../utils/rtsp-loopback-bridge-interleaved-frame.util.js';

export class RtspLoopbackBridge {
  private readonly logger: Logger;
  private readonly maximumPrerollBytes: number;
  private readonly maximumPrerollPackets: number;
  private readonly maximumClientQueuedBytes: number;
  private readonly maximumClients: number;
  private readonly server: Server;
  private readonly clients = new Set<BridgeClient>();
  private readonly preroll: BufferedFrame[] = [];
  private readonly token = randomBytes(16).toString('hex');
  private unsubscribe: (() => void) | undefined;
  private currentTrack: TrackDescription | undefined;
  private configurationTracker = new H264ConfigurationTracker();
  private configuration: H264CodecConfiguration | undefined;
  private currentSsrc: number | undefined;
  private currentTimestamp: number | undefined;
  private prerollBytes = 0;
  private forwardedPackets = 0;
  private droppedClients = 0;
  private running = false;
  private stopped = false;
  private startPromise: Promise<string> | undefined;
  private stopPromise: Promise<void> | undefined;
  private urlValue: string | undefined;

  constructor(private readonly options: RtspLoopbackBridgeOptions) {
    this.logger = options.logger ?? NOOP_LOGGER;
    this.maximumPrerollBytes = positiveInteger(
      options.maximumPrerollBytes,
      8 * 1024 * 1024,
      'maximumPrerollBytes',
    );
    this.maximumPrerollPackets = positiveInteger(
      options.maximumPrerollPackets,
      4_096,
      'maximumPrerollPackets',
    );
    this.maximumClientQueuedBytes = positiveInteger(
      options.maximumClientQueuedBytes,
      8 * 1024 * 1024,
      'maximumClientQueuedBytes',
    );
    this.maximumClients = positiveInteger(options.maximumClients, 2, 'maximumClients');
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.on('error', (error) => this.reportError(error));
  }

  get url(): string | undefined {
    return this.urlValue;
  }

  get status(): RtspLoopbackBridgeStatus {
    return {
      running: this.running,
      clientCount: this.clients.size,
      playingClientCount: [...this.clients].filter((client) => client.playing).length,
      prerollBytes: this.prerollBytes,
      prerollPackets: this.preroll.length,
      forwardedPackets: this.forwardedPackets,
      droppedClients: this.droppedClients,
    };
  }

  start(): Promise<string> {
    if (this.stopped) return Promise.reject(new Error('RTSP bridge has been stopped.'));
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  stop(): Promise<void> {
    this.stopPromise ??= this.stopInternal();
    return this.stopPromise;
  }

  private async stopInternal(): Promise<void> {
    this.stopped = true;
    await this.startPromise?.catch(() => undefined);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const client of this.clients) client.socket.destroy();
    this.clients.clear();
    this.preroll.length = 0;
    this.prerollBytes = 0;
    if (this.server.listening) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
    this.running = false;
    this.urlValue = undefined;
  }

  private async startInternal(): Promise<string> {
    const track = h264Track(this.options.source.tracks);
    if (track === undefined) throw new Error('RTSP bridge source has no H.264 video track.');
    this.setTrack(track, false);
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

  private accept(socket: Socket): void {
    socket.setNoDelay(true);
    if (this.clients.size >= this.maximumClients) {
      this.droppedClients += 1;
      socket.destroy();
      return;
    }
    const client: BridgeClient = {
      socket,
      parser: new RtspMixedParser(),
      sessionId: randomBytes(8).toString('hex'),
      rtpChannel: 0,
      rtcpChannel: 1,
      playing: false,
    };
    this.clients.add(client);
    socket.on('data', (chunk: Buffer) => this.receive(client, chunk));
    socket.on('error', (error) => this.reportError(error));
    socket.on('close', () => this.clients.delete(client));
  }

  private receive(client: BridgeClient, chunk: Buffer): void {
    try {
      for (const item of client.parser.push(chunk)) {
        if (item.type === 'interleaved-frame') continue;
        this.handleRequest(client, item);
      }
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error(String(error)));
      client.socket.destroy();
    }
  }

  private handleRequest(client: BridgeClient, request: RtspMessage): void {
    if (request.startLine.type !== 'request') {
      this.respond(client, request, 400, 'Bad Request');
      return;
    }
    const method = request.startLine.method.toUpperCase();
    if (!this.validRequestUri(request.startLine.uri, method)) {
      this.respond(client, request, 404, 'Not Found');
      return;
    }
    switch (method) {
      case 'OPTIONS':
        this.respond(client, request, 200, 'OK', {
          Public: 'OPTIONS, DESCRIBE, SETUP, PLAY, PAUSE, GET_PARAMETER, SET_PARAMETER, TEARDOWN',
        });
        return;
      case 'DESCRIBE': {
        const body = Buffer.from(this.createSdp(), 'utf8');
        this.respond(client, request, 200, 'OK', {
          'Content-Type': 'application/sdp',
          'Content-Base': `${this.urlValue as string}/`,
        }, body);
        return;
      }
      case 'SETUP': {
        const channels = parseInterleavedChannels(getRtspHeader(request, 'transport'));
        if (channels === undefined) {
          this.respond(client, request, 461, 'Unsupported Transport');
          return;
        }
        client.rtpChannel = channels.rtpChannel;
        client.rtcpChannel = channels.rtcpChannel;
        this.respond(client, request, 200, 'OK', {
          Session: `${client.sessionId};timeout=60`,
          Transport: `RTP/AVP/TCP;unicast;interleaved=${client.rtpChannel}-${client.rtcpChannel}`,
        });
        return;
      }
      case 'PLAY':
        this.respond(client, request, 200, 'OK', {
          Session: client.sessionId,
          Range: 'npt=0.000-',
          'RTP-Info': `url=${this.urlValue as string}/trackID=0`,
        });
        client.playing = true;
        for (const frame of this.preroll) this.sendFrame(client, frame);
        return;
      case 'PAUSE':
        client.playing = false;
        this.respond(client, request, 200, 'OK', { Session: client.sessionId });
        return;
      case 'GET_PARAMETER':
      case 'SET_PARAMETER':
        this.respond(client, request, 200, 'OK', { Session: client.sessionId });
        return;
      case 'TEARDOWN':
        client.playing = false;
        this.respond(client, request, 200, 'OK', { Session: client.sessionId });
        client.socket.end();
        return;
      default:
        this.respond(client, request, 405, 'Method Not Allowed');
    }
  }

  private respond(
    client: BridgeClient,
    request: RtspMessage,
    status: number,
    statusText: string,
    headers: Readonly<Record<string, string>> = {},
    body = Buffer.alloc(0),
  ): void {
    const cseq = getRtspHeader(request, 'cseq');
    if (cseq === undefined) {
      client.socket.destroy(new Error('Local RTSP client omitted CSeq.'));
      return;
    }
    const allHeaders: Record<string, string> = {
      CSeq: cseq,
      Server: 'ain-nvr/0.1',
      ...headers,
      'Content-Length': String(body.length),
    };
    const head = Buffer.from(
      `RTSP/1.0 ${status} ${statusText}\r\n${Object.entries(allHeaders)
        .map(([name, value]) => `${name}: ${value}\r\n`).join('')}\r\n`,
      'ascii',
    );
    client.socket.write(body.length === 0 ? head : Buffer.concat([head, body]));
  }

  private validRequestUri(uri: string, method: string): boolean {
    if (method === 'OPTIONS' && uri === '*') return true;
    try {
      const parsed = new URL(uri);
      return parsed.hostname === '127.0.0.1'
        && (parsed.pathname === `/${this.token}`
          || parsed.pathname === `/${this.token}/`
          || parsed.pathname === `/${this.token}/trackID=0`);
    } catch {
      return false;
    }
  }

  private createSdp(): string {
    const track = this.currentTrack as TrackDescription;
    const configuration = this.configuration;
    const fmtp = configuration === undefined
      ? 'packetization-mode=1'
      : `packetization-mode=1;profile-level-id=${configuration.decoder.codec.slice(5)};`
        + `sprop-parameter-sets=${configuration.sps.toString('base64')},`
        + configuration.pps.toString('base64');
    return [
      'v=0',
      `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
      's=ain-nvr loopback bridge',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      'a=control:*',
      'a=range:npt=0-',
      `m=video 0 RTP/AVP ${track.payloadType}`,
      `a=rtpmap:${track.payloadType} H264/${track.clockRate}`,
      `a=fmtp:${track.payloadType} ${fmtp}`,
      'a=control:trackID=0',
      'a=sendonly',
      '',
    ].join('\r\n');
  }

  private capture(packet: MediaPacket): void {
    const track = packet.track;
    if (track?.mediaType !== 'video' || track.codec !== 'h264') return;
    const isRtcp = packet.channel === track.rtcpChannel;
    if (!isRtcp && (packet.channel !== track.rtpChannel || packet.rtp === undefined)) return;

    if (this.currentTrack === undefined || trackSignature(this.currentTrack) !== trackSignature(track)) {
      this.setTrack(track, true);
    }
    if (!isRtcp && packet.rtp !== undefined) {
      const reset = (this.currentSsrc !== undefined && this.currentSsrc !== packet.rtp.ssrc)
        || (this.currentTimestamp !== undefined
          && signedTimestampDelta(packet.rtp.timestamp, this.currentTimestamp) * 1000
            / track.clockRate < -5_000);
      if (reset) this.resetMedia(true);
      this.currentSsrc = packet.rtp.ssrc;
      this.currentTimestamp = packet.rtp.timestamp;
      const learned = this.configurationTracker.push(packet.rtp.payload, packet.rtp.timestamp);
      if (learned !== undefined) this.configuration = learned;
    }

    const frame: BufferedFrame = { isRtcp, payload: Buffer.from(packet.frame.payload) };
    this.preroll.push(frame);
    this.prerollBytes += frame.payload.length + 4;
    while (this.preroll.length > this.maximumPrerollPackets
      || this.prerollBytes > this.maximumPrerollBytes) {
      const removed = this.preroll.shift();
      if (removed === undefined) break;
      this.prerollBytes -= removed.payload.length + 4;
    }
    for (const client of this.clients) {
      if (client.playing) this.sendFrame(client, frame);
    }
  }

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

  private setTrack(track: TrackDescription, disconnectClients: boolean): void {
    this.currentTrack = track;
    this.configurationTracker = new H264ConfigurationTracker();
    this.configuration = undefined;
    if (track.parameterSets !== undefined) {
      try {
        this.configuration = createH264CodecConfiguration(
          track.parameterSets.sps,
          track.parameterSets.pps,
        );
        this.configurationTracker.seed(track.parameterSets.sps, track.parameterSets.pps);
      } catch {
        // A valid in-band configuration may arrive later.
      }
    }
    this.resetMedia(disconnectClients, false);
  }

  private resetMedia(disconnectClients: boolean, resetConfiguration = true): void {
    this.preroll.length = 0;
    this.prerollBytes = 0;
    this.currentSsrc = undefined;
    this.currentTimestamp = undefined;
    if (resetConfiguration) this.configurationTracker.resetFragments();
    if (disconnectClients) {
      for (const client of this.clients) client.socket.destroy();
    }
  }

  private reportError(error: Error): void {
    this.options.onError?.(error);
    this.logger.warn('RTSP loopback bridge error.', { error });
  }
}
