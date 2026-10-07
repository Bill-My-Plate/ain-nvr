import { EventEmitter, once } from 'node:events';
import net, { type Socket } from 'node:net';
import tls from 'node:tls';
import { AinNvrError } from '../shared/index.js';
import { createRtspAuthorization } from './create-rtsp-authorization.util.js';
import { parseRtspAuthChallenge } from './parse-rtsp-auth-challenge.util.js';
import { type DigestAuthorizationState } from './digest-authorization-state.interface.js';
import { type RtspAuthChallenge } from './rtsp-auth-challenge.type.js';
import { type RtspCredentials } from './rtsp-credentials.interface.js';
import type { RtspInterleavedFrame } from '../rtsp-parser/index.js';
import { getRtspHeader, type RtspMessage } from '../rtsp-parser/index.js';
import { RtspMixedParser } from '../rtsp-parser/index.js';
import { parseSdp, resolveRtspControlUrl, selectG711AudioMedia, selectH264VideoMedia } from '../rtsp-parser/index.js';

import type { RtspClientOptions } from './rtsp-client-options.interface.js';
import type { RtspAudioTrack } from './rtsp-audio-track.interface.js';
import type { RtspClientSession } from './rtsp-client-session.interface.js';
import { RtspClientError } from './rtsp-client-error.class.js';
import type { PendingRequest } from './pending-request.type.js';
import type { RequestOptions } from './request-options.type.js';
import { positiveInteger } from './positive-integer.util.js';
import { parseSession } from './parse-session.util.js';
import { publicMethods } from './public-methods.util.js';
import { interleavedChannels } from './interleaved-channels.util.js';

export class RtspClient extends EventEmitter {
  private readonly parsedUrl: URL;
  private readonly requestUrl: string;
  private readonly credentials: RtspCredentials | undefined;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly configuredKeepaliveMs: number | undefined;
  private readonly mediaTimeoutMs: number;
  private readonly socketFactory: (port: number, host: string) => Socket;
  private readonly connectEvent: 'connect' | 'secureConnect';
  private readonly parser = new RtspMixedParser();
  private readonly pending = new Map<number, PendingRequest>();
  private socket: Socket | undefined;
  private sequence = 0;
  private authChallenge: RtspAuthChallenge | undefined;
  private digestState: DigestAuthorizationState | undefined;
  private sessionId: string | undefined;
  private keepaliveTimer: NodeJS.Timeout | undefined;
  private mediaWatchdogTimer: NodeJS.Timeout | undefined;
  private keepaliveMethod = 'OPTIONS';
  private readonly mediaRtpChannels = new Set<number>();
  private lastMediaPacketTimeMs = 0;
  private closing = false;

  constructor(options: RtspClientOptions) {
    super();
    this.parsedUrl = new URL(options.url);
    if (this.parsedUrl.protocol !== 'rtsp:' && this.parsedUrl.protocol !== 'rtsps:') {
      throw new RtspClientError('Camera URL must use rtsp:// or rtsps://.');
    }
    if (!this.parsedUrl.hostname) {
      throw new RtspClientError('Camera URL lacks a host.');
    }
    const username = decodeURIComponent(this.parsedUrl.username);
    const password = decodeURIComponent(this.parsedUrl.password);
    this.credentials = username.length === 0 ? undefined : { username, password };
    const safeUrl = new URL(this.parsedUrl);
    safeUrl.username = '';
    safeUrl.password = '';
    this.requestUrl = safeUrl.toString();
    this.connectTimeoutMs = positiveInteger(options.connectTimeoutMs, 5_000, 'connectTimeoutMs');
    this.requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 5_000, 'requestTimeoutMs');
    this.configuredKeepaliveMs = options.keepaliveIntervalMs;
    if (this.configuredKeepaliveMs !== undefined) {
      positiveInteger(this.configuredKeepaliveMs, 1, 'keepaliveIntervalMs');
    }
    this.mediaTimeoutMs = positiveInteger(options.mediaTimeoutMs, 15_000, 'mediaTimeoutMs');
    this.connectEvent = options.socketFactory === undefined && this.parsedUrl.protocol === 'rtsps:'
      ? 'secureConnect'
      : 'connect';
    this.socketFactory = options.socketFactory ?? (this.parsedUrl.protocol === 'rtsps:'
      ? ((port, host) => tls.connect({ port, host, servername: host }))
      : ((port, host) => net.createConnection({ port, host })));
  }

  async connect(): Promise<RtspClientSession> {
    if (this.socket !== undefined) {
      throw new RtspClientError('RTSP client is already connected.');
    }
    this.closing = false;
    const port = this.parsedUrl.port
      ? Number(this.parsedUrl.port)
      : this.parsedUrl.protocol === 'rtsps:' ? 322 : 554;
    const socket = this.socketFactory(port, this.parsedUrl.hostname);
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => this.handleData(chunk));
    socket.on('error', (error) => this.handleDisconnect(error));
    socket.on('close', () => this.handleDisconnect(new RtspClientError('RTSP socket closed.')));

    const connectTimeout = setTimeout(() => {
      socket.destroy(new RtspClientError('RTSP connection timed out.'));
    }, this.connectTimeoutMs);
    connectTimeout.unref();
    try {
      if (!socket.readyState || socket.connecting) {
        await Promise.race([
          once(socket, this.connectEvent),
          once(socket, 'error').then(([error]) => Promise.reject(error)),
        ]);
      }
    } finally {
      clearTimeout(connectTimeout);
    }

    try {
      const options = await this.request('OPTIONS', this.requestUrl);
      const methods = publicMethods(options);
      this.keepaliveMethod = methods.has('GET_PARAMETER') ? 'GET_PARAMETER' : 'OPTIONS';

      const describe = await this.request('DESCRIBE', this.requestUrl, {
        headers: { Accept: 'application/sdp' },
      });
      const sdp = describe.body.toString('utf8');
      const description = parseSdp(sdp);
      const selected = selectH264VideoMedia(description);
      if (selected === undefined || !selected.media.control) {
        throw new AinNvrError('unsupported_codec', 'DESCRIBE response has no controlled H.264 video track.');
      }
      const contentBase = getRtspHeader(describe, 'content-base')
        ?? getRtspHeader(describe, 'content-location');
      const controlUrl = resolveRtspControlUrl(
        this.requestUrl,
        selected.media.control,
        description.sessionControl,
        contentBase,
      );

      const setup = await this.request('SETUP', controlUrl, {
        headers: { Transport: 'RTP/AVP/TCP;unicast;interleaved=0-1' },
      });
      const session = parseSession(getRtspHeader(setup, 'session'));
      this.sessionId = session.sessionId;
      const videoChannels = interleavedChannels(getRtspHeader(setup, 'transport'), 0, 1);
      const { rtpChannel, rtcpChannel } = videoChannels;

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
          const audioSetup = await this.request('SETUP', audioControlUrl, {
            headers: {
              Session: this.sessionId,
              Transport: 'RTP/AVP/TCP;unicast;interleaved=2-3',
            },
          });
          const audioChannels = interleavedChannels(
            getRtspHeader(audioSetup, 'transport'),
            2,
            3,
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

      await this.request('PLAY', this.requestUrl, {
        headers: { Session: this.sessionId, Range: 'npt=0.000-' },
      });
      this.mediaRtpChannels.clear();
      this.mediaRtpChannels.add(rtpChannel);
      if (audio !== undefined) this.mediaRtpChannels.add(audio.rtpChannel);
      this.lastMediaPacketTimeMs = Date.now();
      this.startKeepalive(session.timeoutSeconds);
      this.startMediaWatchdog();
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

  async close(): Promise<void> {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.stopKeepalive();
    this.stopMediaWatchdog();
    const socket = this.socket;
    if (socket === undefined) {
      return;
    }
    if (!socket.destroyed && this.sessionId !== undefined) {
      try {
        await this.request('TEARDOWN', this.requestUrl, {
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
        once(socket, 'close'),
        new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            socket.destroy();
            resolve();
          }, 250);
          timeout.unref();
        }),
      ]);
    }
    this.socket = undefined;
  }

  pauseMedia(): void {
    this.socket?.pause();
  }

  resumeMedia(): void {
    this.socket?.resume();
  }

  private async request(
    method: string,
    uri: string,
    options: RequestOptions = {},
  ): Promise<RtspMessage> {
    let response: RtspMessage | undefined;
    const maximumAttempts = options.allowAuthRetry === false ? 1 : 3;
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
      if (response.startLine.type !== 'response') {
        throw new RtspClientError('Camera returned an RTSP request where a response was expected.');
      }
      if (response.startLine.statusCode !== 401) break;
      if (this.credentials === undefined) {
        throw new RtspClientError('Camera requires credentials.', 401);
      }
      const authenticate = getRtspHeader(response, 'www-authenticate');
      if (!authenticate) {
        throw new RtspClientError('Authentication response lacks WWW-Authenticate.', 401);
      }
      this.authChallenge = parseRtspAuthChallenge(authenticate);
      this.digestState = undefined;
    }
    if (response === undefined) {
      throw new RtspClientError(`RTSP ${method} produced no response.`);
    }

    if (response.startLine.type !== 'response'
      || response.startLine.statusCode < 200
      || response.startLine.statusCode >= 300) {
      const status = response.startLine.type === 'response' ? response.startLine.statusCode : undefined;
      throw new RtspClientError(`RTSP ${method} failed${status === undefined ? '' : ` with ${status}`}.`, status);
    }
    return response;
  }

  private requestOnce(
    method: string,
    uri: string,
    options: RequestOptions,
    authorization?: string,
  ): Promise<RtspMessage> {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return Promise.reject(new RtspClientError('RTSP socket is not connected.'));
    }
    const cseq = ++this.sequence;
    const body = options.body ?? Buffer.alloc(0);
    const headers: Record<string, string> = {
      CSeq: String(cseq),
      'User-Agent': 'ain-nvr/0.1',
      ...(options.headers ?? {}),
      ...(authorization === undefined ? {} : { Authorization: authorization }),
      ...(body.length === 0 ? {} : { 'Content-Length': String(body.length) }),
    };
    const head = Buffer.from(
      `${method} ${uri} RTSP/1.0\r\n${Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}\r\n`).join('')}\r\n`,
      'utf8',
    );

    return new Promise<RtspMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(cseq);
        reject(new RtspClientError(`RTSP ${method} request timed out.`));
      }, this.requestTimeoutMs);
      timeout.unref();
      this.pending.set(cseq, { resolve, reject, timeout });
      socket.write(body.length === 0 ? head : Buffer.concat([head, body]), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(cseq);
          reject(error);
        }
      });
    });
  }

  private handleData(chunk: Buffer): void {
    try {
      for (const item of this.parser.push(chunk)) {
        if (item.type === 'interleaved-frame') {
          if (this.mediaRtpChannels.has(item.channel)) this.lastMediaPacketTimeMs = Date.now();
          this.emit('interleaved', item as RtspInterleavedFrame);
          continue;
        }
        if (item.startLine.type === 'request') {
          this.respondToServerRequest(item);
          continue;
        }
        const rawSequence = getRtspHeader(item, 'cseq');
        const cseq = rawSequence === undefined ? Number.NaN : Number(rawSequence);
        const pending = this.pending.get(cseq);
        if (pending !== undefined) {
          clearTimeout(pending.timeout);
          this.pending.delete(cseq);
          pending.resolve(item);
        }
      }
    } catch (error) {
      this.socket?.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private respondToServerRequest(request: RtspMessage): void {
    const socket = this.socket;
    if (socket === undefined || socket.destroyed) {
      return;
    }
    const cseq = getRtspHeader(request, 'cseq');
    socket.write(Buffer.from(
      `RTSP/1.0 200 OK\r\n${cseq === undefined ? '' : `CSeq: ${cseq}\r\n`}Content-Length: 0\r\n\r\n`,
      'ascii',
    ));
  }

  private handleDisconnect(error: Error): void {
    this.stopKeepalive();
    this.stopMediaWatchdog();
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
    if (!this.closing) {
      this.emit('disconnect', error);
    }
  }

  private startKeepalive(sessionTimeoutSeconds: number | undefined): void {
    const interval = this.configuredKeepaliveMs
      ?? Math.max(1_000, Math.floor((sessionTimeoutSeconds ?? 60) * 500));
    this.keepaliveTimer = setInterval(() => {
      if (this.sessionId === undefined || this.pending.size > 0) {
        return;
      }
      void this.request(this.keepaliveMethod, this.requestUrl, {
        headers: { Session: this.sessionId },
      }).catch((error: unknown) => {
        if (error instanceof RtspClientError
          && (error.statusCode === 405 || error.statusCode === 501)) {
          const fallback = this.keepaliveMethod === 'GET_PARAMETER' ? 'OPTIONS' : 'GET_PARAMETER';
          void this.request(fallback, this.requestUrl, {
            headers: { Session: this.sessionId as string },
          }).then(() => {
            this.keepaliveMethod = fallback;
          }).catch((fallbackError: unknown) => {
            this.socket?.destroy(fallbackError instanceof Error
              ? fallbackError
              : new Error(String(fallbackError)));
          });
          return;
        }
        this.socket?.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    }, interval);
    this.keepaliveTimer.unref();
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== undefined) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
  }


  private startMediaWatchdog(): void {
    const interval = Math.max(250, Math.min(1_000, Math.floor(this.mediaTimeoutMs / 3)));
    this.mediaWatchdogTimer = setInterval(() => {
      if (this.lastMediaPacketTimeMs > 0
        && Date.now() - this.lastMediaPacketTimeMs >= this.mediaTimeoutMs) {
        this.socket?.destroy(new RtspClientError(
          `No RTP media packets were received for ${this.mediaTimeoutMs} ms.`,
        ));
      }
    }, interval);
    this.mediaWatchdogTimer.unref();
  }

  private stopMediaWatchdog(): void {
    if (this.mediaWatchdogTimer !== undefined) {
      clearInterval(this.mediaWatchdogTimer);
      this.mediaWatchdogTimer = undefined;
    }
  }
}
