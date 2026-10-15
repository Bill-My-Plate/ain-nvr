import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import { randomBytes } from 'node:crypto';
import net, { type Server, type Socket } from 'node:net';

import { RtspParser } from '../../rtsp-parser/index.js';

import type { ClientState } from '../types/client-state.type.js';
import type { PlaybackRtspServerOptions } from '../types/playback-rtsp-server-options.type.js';
import { DEFAULT_MAXIMUM_QUEUED_BYTES } from '../constants/default-maximum-queued-bytes.constant.js';
import { PlaybackRtspRequestHandler } from './playback-rtsp-request-handler.class.js';
import { sendPlaybackRtspPacket } from '../utils/send-playback-rtsp-packet.util.js';

/**
 * Accepts a local RTSP client and sends packetized playback over interleaved TCP.
 */
export class PlaybackRtspServer {
  private readonly server: Server;
  private readonly token = randomBytes(STREAM_ADAPTER_CONSTANTS.playbackTokenBytes).toString('hex');
  private readonly maximumQueuedBytes: number;
  private readonly requests: PlaybackRtspRequestHandler;
  private client: ClientState | undefined;
  private urlValue: string | undefined;
  private playResolve: (() => void) | undefined;
  private playReject: ((error: Error) => void) | undefined;
  private readonly playPromise: Promise<void>;
  private stopped = false;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(private readonly options: PlaybackRtspServerOptions) {
    this.maximumQueuedBytes = options.maximumQueuedBytes ?? DEFAULT_MAXIMUM_QUEUED_BYTES;
    if (!Number.isSafeInteger(this.maximumQueuedBytes) || this.maximumQueuedBytes <= 0) {
      throw new RangeError('maximumQueuedBytes must be a positive safe integer.');
    }
    if (
      options.audioSampleRate !== undefined &&
      (!Number.isSafeInteger(options.audioSampleRate) || options.audioSampleRate <= 0)
    ) {
      throw new RangeError('audioSampleRate must be a positive safe integer.');
    }
    this.playPromise = new Promise<void>((resolve, reject) => {
      this.playResolve = resolve;
      this.playReject = reject;
    });
    this.playPromise.catch(() => undefined);
    this.requests = new PlaybackRtspRequestHandler(
      options,
      this.token,
      () => this.urlValue,
      () => this.completePlay(),
    );
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.on('error', (error) => {
      this.playReject?.(error);
    });
  }

  /**
   * Returns the local RTSP URL after startup.
   */
  public get url(): string | undefined {
    return this.urlValue;
  }

  /**
   * Opens the loopback listener and returns its token-scoped RTSP URL.
   */
  public async start(): Promise<string> {
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

  /**
   * Waits for a client PLAY request, cancellation, or the configured timeout.
   */
  public async waitForPlay(
    signal?: AbortSignal,
    timeoutMs: number = STREAM_ADAPTER_CONSTANTS.defaultPlayTimeoutMs,
  ): Promise<void> {
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
          reject(
            signal?.reason instanceof Error
              ? signal.reason
              : new Error('Playback RTSP bridge aborted.'),
          );
        };
        if (signal?.aborted === true) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        this.playPromise
          .finally(() => {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
          })
          .catch(() => undefined);
      }),
    ]);
  }

  /**
   * Sends one video RTP packet on the negotiated video channel.
   * @param packet A complete variable-length RTP or RTCP packet. RTP starts with a 12-byte fixed header; RTCP starts with a four-byte common header. RTSP interleaved framing, when used, adds four bytes.
   */
  public async sendVideo(packet: Buffer): Promise<void> {
    await sendPlaybackRtspPacket(this.client, 0, packet, this.maximumQueuedBytes);
  }

  /**
   * Sends one audio RTP packet on the negotiated audio channel.
   * @param packet A complete variable-length RTP or RTCP packet. RTP starts with a 12-byte fixed header; RTCP starts with a four-byte common header. RTSP interleaved framing, when used, adds four bytes.
   */
  public async sendAudio(packet: Buffer): Promise<void> {
    await sendPlaybackRtspPacket(this.client, 1, packet, this.maximumQueuedBytes);
  }

  /**
   * Ends media delivery to the connected RTSP client.
   */
  public async finish(): Promise<void> {
    const socket = this.client?.socket;
    if (socket === undefined || socket.destroyed) return;
    await new Promise<void>((resolve) => socket.end(resolve));
  }

  /**
   * Stops active work and releases owned resources.
   */
  public async stop(): Promise<void> {
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

  /**
   * Accepts one local client and connects its parser and lifecycle events.
   */
  private accept(socket: Socket): void {
    if (this.client !== undefined) {
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    const client: ClientState = {
      socket,
      parser: new RtspParser(),
      sessionId: randomBytes(STREAM_ADAPTER_CONSTANTS.playbackSessionIdBytes).toString('hex'),
      channels: new Map(),
      playing: false,
    };
    this.client = client;
    socket.on('data', (chunk: Buffer) => this.receive(client, chunk));
    socket.on('error', (error) => {
      this.playReject?.(error);
    });
    socket.on('close', () => {
      if (this.client === client) this.client = undefined;
      if (!client.playing) {
        this.playReject?.(new Error('RTSP client closed before PLAY.'));
      }
    });
  }

  /**
   * Parses arbitrary TCP chunks from the client and dispatches complete RTSP messages.
   * @param chunk A stream chunk of any length. It may contain part of an RTSP
   * request, multiple requests, or interleaved frames; the parser buffers
   * incomplete messages and this server handles only RTSP requests.
   */
  private receive(client: ClientState, chunk: Buffer): void {
    try {
      for (const item of client.parser.push(chunk)) {
        if (item.type === 'rtsp-message') this.requests.handle(client, item);
      }
    } catch (error) {
      client.socket.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Resolves the pending PLAY waiter after the response is sent. */
  private completePlay(): void {
    this.playResolve?.();
    this.playResolve = undefined;
    this.playReject = undefined;
  }
}
