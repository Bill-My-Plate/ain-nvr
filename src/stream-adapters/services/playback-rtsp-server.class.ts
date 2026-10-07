import { randomBytes } from 'node:crypto';
import net, { type Server, type Socket } from 'node:net';


import { getRtspHeader, type RtspMessage } from '../../rtsp-parser/index.js';
import { RtspMixedParser } from '../../rtsp-parser/index.js';

import type { ClientState } from '../types/client-state.type.js';
import type { PlaybackRtspServerOptions } from '../types/playback-rtsp-server-options.type.js';
import { DEFAULT_MAXIMUM_QUEUED_BYTES } from '../constants/default-maximum-queued-bytes.constant.js';
import { parseChannels } from '../utils/parse-channels.util.js';
import { interleavedFrame } from '../utils/playback-rtsp-server-interleaved-frame.util.js';

export class PlaybackRtspServer {
  private readonly server: Server;
  private readonly token = randomBytes(16).toString('hex');
  private readonly maximumQueuedBytes: number;
  private client: ClientState | undefined;
  private urlValue: string | undefined;
  private playResolve: (() => void) | undefined;
  private playReject: ((error: Error) => void) | undefined;
  private readonly playPromise: Promise<void>;
  private stopped = false;

  constructor(private readonly options: PlaybackRtspServerOptions) {
    this.maximumQueuedBytes = options.maximumQueuedBytes ?? DEFAULT_MAXIMUM_QUEUED_BYTES;
    if (!Number.isSafeInteger(this.maximumQueuedBytes) || this.maximumQueuedBytes <= 0) {
      throw new RangeError('maximumQueuedBytes must be a positive safe integer.');
    }
    if (options.audioSampleRate !== undefined
      && (!Number.isSafeInteger(options.audioSampleRate) || options.audioSampleRate <= 0)) {
      throw new RangeError('audioSampleRate must be a positive safe integer.');
    }
    this.playPromise = new Promise<void>((resolve, reject) => {
      this.playResolve = resolve;
      this.playReject = reject;
    });
    this.playPromise.catch(() => undefined);
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.on('error', (error) => {
      if (!this.stopped) {
        this.options.logger?.warn('Playback RTSP server failed.', { error });
      }
      this.playReject?.(error);
    });
  }

  get url(): string | undefined {
    return this.urlValue;
  }

  async start(): Promise<string> {
    if (this.stopped) throw new Error('Playback RTSP server is stopped.');
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.server.once('error', onError);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', onError);
        resolve();
      });
    });
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Playback RTSP server did not receive a TCP port.');
    }
    this.urlValue = `rtsp://127.0.0.1:${address.port}/${this.token}`;
    return this.urlValue;
  }

  async waitForPlay(signal?: AbortSignal, timeoutMs = 15_000): Promise<void> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive safe integer.');
    }
    await Promise.race([
      this.playPromise,
      new Promise<never>((_resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('RTSP client did not start playback in time.')),
          timeoutMs,
        );
        timeout.unref();
        const abort = (): void => {
          clearTimeout(timeout);
          reject(signal?.reason instanceof Error
            ? signal.reason
            : new Error('Playback RTSP bridge aborted.'));
        };
        if (signal?.aborted === true) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        this.playPromise.finally(() => {
          clearTimeout(timeout);
          signal?.removeEventListener('abort', abort);
        }).catch(() => undefined);
      }),
    ]);
  }

  async sendVideo(packet: Buffer): Promise<void> {
    await this.sendPacket(0, packet);
  }

  async sendAudio(packet: Buffer): Promise<void> {
    await this.sendPacket(1, packet);
  }

  async finish(): Promise<void> {
    const socket = this.client?.socket;
    if (socket === undefined || socket.destroyed) return;
    await new Promise<void>((resolve) => socket.end(resolve));
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.playReject?.(new Error('Playback RTSP server stopped before playback.'));
    this.playResolve = undefined;
    this.playReject = undefined;
    this.client?.socket.destroy();
    this.client = undefined;
    if (this.server.listening) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
    this.urlValue = undefined;
  }

  private accept(socket: Socket): void {
    if (this.client !== undefined) {
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    const client: ClientState = {
      socket,
      parser: new RtspMixedParser(),
      sessionId: randomBytes(8).toString('hex'),
      channels: new Map(),
      playing: false,
    };
    this.client = client;
    socket.on('data', (chunk: Buffer) => this.receive(client, chunk));
    socket.on('error', (error) => {
      if (!this.stopped) {
        this.options.logger?.warn('Playback RTSP client failed.', { error });
      }
      this.playReject?.(error);
    });
    socket.on('close', () => {
      if (this.client === client) this.client = undefined;
      if (!client.playing) {
        this.playReject?.(new Error('RTSP client closed before PLAY.'));
      }
    });
  }

  private receive(client: ClientState, chunk: Buffer): void {
    try {
      for (const item of client.parser.push(chunk)) {
        if (item.type === 'rtsp-message') this.handleRequest(client, item);
      }
    } catch (error) {
      client.socket.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleRequest(client: ClientState, request: RtspMessage): void {
    if (request.startLine.type !== 'request') {
      this.respond(client, request, 400, 'Bad Request');
      return;
    }
    const method = request.startLine.method.toUpperCase();
    if (!this.validUri(request.startLine.uri, method)) {
      this.respond(client, request, 404, 'Not Found');
      return;
    }

    switch (method) {
      case 'OPTIONS':
        this.respond(client, request, 200, 'OK', {
          Public: 'OPTIONS, DESCRIBE, SETUP, PLAY, GET_PARAMETER, TEARDOWN',
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
        const track = this.trackFromUri(request.startLine.uri);
        const channels = parseChannels(getRtspHeader(request, 'transport'));
        if (track === undefined || channels === undefined
          || (track === 1 && this.options.audioSampleRate === undefined)) {
          this.respond(client, request, 461, 'Unsupported Transport');
          return;
        }
        client.channels.set(track, channels);
        this.respond(client, request, 200, 'OK', {
          Session: `${client.sessionId};timeout=60`,
          Transport: `RTP/AVP/TCP;unicast;interleaved=${channels.rtp}-${channels.rtcp}`,
        });
        return;
      }
      case 'PLAY':
        this.respond(client, request, 200, 'OK', {
          Session: client.sessionId,
          Range: 'npt=0.000-',
          'RTP-Info': this.createRtpInfo(client),
        });
        client.playing = true;
        this.playResolve?.();
        this.playResolve = undefined;
        this.playReject = undefined;
        return;
      case 'GET_PARAMETER':
        this.respond(client, request, 200, 'OK', { Session: client.sessionId });
        return;
      case 'TEARDOWN':
        this.respond(client, request, 200, 'OK', { Session: client.sessionId });
        client.socket.end();
        return;
      default:
        this.respond(client, request, 405, 'Method Not Allowed');
    }
  }

  private respond(
    client: ClientState,
    request: RtspMessage,
    status: number,
    statusText: string,
    headers: Readonly<Record<string, string>> = {},
    body = Buffer.alloc(0),
  ): void {
    if (client.socket.destroyed || client.socket.writableEnded) return;
    const cseq = getRtspHeader(request, 'cseq');
    if (cseq === undefined) {
      client.socket.destroy(new Error('Local RTSP client omitted CSeq.'));
      return;
    }
    const responseHeaders = {
      CSeq: cseq,
      Server: 'ain-nvr/playback',
      ...headers,
      'Content-Length': String(body.length),
    };
    const header = Buffer.from(
      `RTSP/1.0 ${status} ${statusText}\r\n${Object.entries(responseHeaders)
        .map(([name, value]) => `${name}: ${value}\r\n`).join('')}\r\n`,
      'ascii',
    );
    client.socket.write(body.length === 0 ? header : Buffer.concat([header, body]));
  }

  private createRtpInfo(client: ClientState): string {
    // Both timestamps describe the same npt=0 instant, not each track's first
    // packet. Otherwise the client independently rebases delayed audio to zero.
    return [...client.channels.keys()].flatMap((track) => {
      const info = track === 0 ? this.options.videoRtpInfo : this.options.audioRtpInfo;
      if (info === undefined) return [];
      return [`url=${this.urlValue as string}/trackID=${track};seq=${info.initialSequenceNumber};rtptime=${info.initialTimestamp}`];
    }).join(',');
  }

  private createSdp(): string {
    const configuration = this.options.configuration;
    const lines = [
      'v=0',
      `o=- ${Date.now()} 1 IN IP4 127.0.0.1`,
      's=ain-nvr playback bridge',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      'a=control:*',
      'a=range:npt=0-',
      'm=video 0 RTP/AVP 96',
      'a=rtpmap:96 H264/90000',
      `a=fmtp:96 packetization-mode=1;profile-level-id=${configuration.decoder.codec.slice(5)};sprop-parameter-sets=${configuration.sps.toString('base64')},${configuration.pps.toString('base64')}`,
      'a=control:trackID=0',
      'a=sendonly',
    ];
    if (this.options.audioSampleRate !== undefined) {
      lines.push(
        'm=audio 0 RTP/AVP 97',
        `a=rtpmap:97 L16/${this.options.audioSampleRate}/1`,
        'a=control:trackID=1',
        'a=sendonly',
      );
    }
    lines.push('');
    return lines.join('\r\n');
  }

  private validUri(uri: string, method: string): boolean {
    if (method === 'OPTIONS' && uri === '*') return true;
    try {
      const parsed = new URL(uri);
      return parsed.protocol === 'rtsp:'
        && parsed.hostname === '127.0.0.1'
        && (parsed.pathname === `/${this.token}`
          || parsed.pathname === `/${this.token}/`
          || parsed.pathname === `/${this.token}/trackID=0`
          || parsed.pathname === `/${this.token}/trackID=1`);
    } catch {
      return false;
    }
  }

  private trackFromUri(uri: string): 0 | 1 | undefined {
    try {
      const pathname = new URL(uri).pathname;
      if (pathname.endsWith('/trackID=0')) return 0;
      if (pathname.endsWith('/trackID=1')) return 1;
    } catch {
      return undefined;
    }
    return undefined;
  }

  private async sendPacket(track: 0 | 1, packet: Buffer): Promise<void> {
    const client = this.client;
    const channel = client?.channels.get(track)?.rtp;
    if (client === undefined || channel === undefined || !client.playing
      || client.socket.destroyed) {
      throw new Error('Playback RTSP client is not ready for media.');
    }
    const frame = interleavedFrame(channel, packet);
    if (client.socket.writableLength + frame.length > this.maximumQueuedBytes) {
      throw new Error('Playback RTSP client exceeded its media queue limit.');
    }
    if (client.socket.write(frame)) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        client.socket.off('drain', onDrain);
        client.socket.off('error', onError);
        client.socket.off('close', onClose);
      };
      const onDrain = (): void => {
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error('Playback RTSP client closed during playback.'));
      };
      client.socket.once('drain', onDrain);
      client.socket.once('error', onError);
      client.socket.once('close', onClose);
    });
  }
}
