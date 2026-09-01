import { EventEmitter } from 'node:events';

import type { Logger } from '../logging/logger.js';
import type { TrackDescription } from '../media/track-description.js';
import { H264AccessUnitAssembler, type H264AccessUnit } from '../playback/access-unit-assembler.js';
import { createH264CodecConfiguration } from '../rtp/h264-configuration.js';
import { parseRtpPacket, type RtpPacket } from '../rtp/packet.js';
import { RtpReorderBuffer } from '../rtp/reorder-buffer.js';
import { findRtcpSenderReport, type RtcpSenderReport } from '../rtp/rtcp.js';
import { RtspClient, type RtspClientSession } from '../rtsp/client.js';
import type { RtspInterleavedFrame } from '../rtsp/interleaved-parser.js';

const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export type SessionState = 'idle' | 'connecting' | 'streaming' | 'reconnecting' | 'stopped';

export interface MediaPacket {
  readonly arrivalTimeMs: number;
  readonly track?: TrackDescription;
  readonly channel: number;
  readonly rawInterleavedFrame: Buffer;
  readonly frame: RtspInterleavedFrame;
  readonly rtp?: RtpPacket;
  readonly rtcpSenderReport?: RtcpSenderReport;
  readonly discontinuity: boolean;
}

export interface RtspStreamSessionOptions {
  readonly url: string;
  readonly logger?: Logger;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly clientFactory?: (url: string) => RtspClient;
  readonly now?: () => number;
}

export interface RtspSessionManagerOptions {
  readonly logger?: Logger;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaximumMs?: number;
  readonly clientFactory?: (url: string) => RtspClient;
}

export interface RtspSessionLease {
  readonly session: RtspStreamSession;
  release(): Promise<void>;
}

type PacketSubscriber = (packet: MediaPacket) => void;
type AccessUnitSubscriber = (accessUnit: H264AccessUnit) => void;

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return resolved;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    timeout.unref();
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

function parseFmtp(value: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const field of value?.split(';') ?? []) {
    const separator = field.indexOf('=');
    if (separator >= 0) {
      result.set(
        field.slice(0, separator).trim().toLowerCase(),
        field.slice(separator + 1).trim(),
      );
    }
  }
  return result;
}

function tracksFromSession(session: RtspClientSession): readonly TrackDescription[] {
  const fmtp = session.video.media.fmtp.get(session.video.rtpMap.payloadType);
  let parameterSets: TrackDescription['parameterSets'];
  const encoded = parseFmtp(fmtp).get('sprop-parameter-sets')?.split(',');
  if (encoded !== undefined && encoded.length >= 2) {
    try {
      const configuration = createH264CodecConfiguration(
        Buffer.from(encoded[0] ?? '', 'base64'),
        Buffer.from(encoded[1] ?? '', 'base64'),
      );
      parameterSets = { sps: configuration.sps, pps: configuration.pps };
    } catch {
      // In-band parameter sets remain authoritative.
    }
  }
  const video: TrackDescription = {
    trackId: 'video',
    mediaType: 'video',
    codec: 'h264',
    payloadType: session.video.rtpMap.payloadType,
    clockRate: session.video.rtpMap.clockRate,
    rtpChannel: session.video.rtpChannel,
    rtcpChannel: session.video.rtcpChannel,
    ...(parameterSets === undefined ? {} : { parameterSets }),
  };
  if (session.audio === undefined) return [video];
  return [video, {
    trackId: 'audio',
    mediaType: 'audio',
    codec: session.audio.codec,
    payloadType: session.audio.rtpMap.payloadType,
    clockRate: session.audio.rtpMap.clockRate,
    rtpChannel: session.audio.rtpChannel,
    rtcpChannel: session.audio.rtcpChannel,
  }];
}

export class RtspStreamSession extends EventEmitter {
  private readonly logger: Logger;
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaximumMs: number;
  private readonly clientFactory: (url: string) => RtspClient;
  private readonly now: () => number;
  private readonly stopController = new AbortController();
  private readonly packetSubscribers = new Set<PacketSubscriber>();
  private readonly accessUnitSubscribers = new Set<AccessUnitSubscriber>();
  private runPromise: Promise<void> | undefined;
  private currentClient: RtspClient | undefined;
  private stateValue: SessionState = 'idle';
  private tracksValue: readonly TrackDescription[] = [];
  private assembler: H264AccessUnitAssembler | undefined;
  private videoReorder = new RtpReorderBuffer<MediaPacket>(4);
  private videoSsrc: number | undefined;
  private videoTimestamp: number | undefined;
  private discontinuityPending = false;
  private pauseCount = 0;

  constructor(private readonly options: RtspStreamSessionOptions) {
    super();
    this.logger = options.logger ?? NOOP_LOGGER;
    this.reconnectInitialMs = positiveInteger(
      options.reconnectInitialMs,
      1_000,
      'reconnectInitialMs',
    );
    this.reconnectMaximumMs = positiveInteger(
      options.reconnectMaximumMs,
      30_000,
      'reconnectMaximumMs',
    );
    this.clientFactory = options.clientFactory ?? ((url) => new RtspClient({ url }));
    this.now = options.now ?? Date.now;
  }

  get state(): SessionState {
    return this.stateValue;
  }

  get tracks(): readonly TrackDescription[] {
    return this.tracksValue;
  }

  async start(signal?: AbortSignal): Promise<void> {
    if (this.runPromise !== undefined) {
      if (this.stateValue === 'streaming') return;
      await this.waitForStreaming(signal);
      return;
    }
    this.runPromise = this.run();
    await this.waitForStreaming(signal);
  }

  async stop(): Promise<void> {
    if (!this.stopController.signal.aborted) {
      this.stopController.abort(new Error('RTSP stream session stopped.'));
    }
    await this.currentClient?.close().catch(() => undefined);
    await this.runPromise;
    this.setState('stopped');
  }

  subscribeMediaPackets(subscriber: PacketSubscriber): () => void {
    this.packetSubscribers.add(subscriber);
    return () => this.packetSubscribers.delete(subscriber);
  }

  subscribeVideoAccessUnits(subscriber: AccessUnitSubscriber): () => void {
    this.accessUnitSubscribers.add(subscriber);
    return () => this.accessUnitSubscribers.delete(subscriber);
  }

  pauseMedia(): void {
    this.pauseCount += 1;
    if (this.pauseCount === 1) this.currentClient?.pauseMedia();
  }

  resumeMedia(): void {
    if (this.pauseCount === 0) return;
    this.pauseCount -= 1;
    if (this.pauseCount === 0) this.currentClient?.resumeMedia();
  }

  private async run(): Promise<void> {
    let delayMs = this.reconnectInitialMs;
    let connectedOnce = false;
    while (!this.stopController.signal.aborted) {
      this.setState(connectedOnce ? 'reconnecting' : 'connecting');
      const client = this.clientFactory(this.options.url);
      this.currentClient = client;
      const queuedFrames: RtspInterleavedFrame[] = [];
      let sessionReady = false;
      let disconnect: ((error: Error) => void) | undefined;
      const disconnected = new Promise<Error>((resolve) => {
        disconnect = resolve;
      });
      const onFrame = (frame: RtspInterleavedFrame): void => {
        if (!sessionReady) queuedFrames.push(frame);
        else this.handleFrame(frame);
      };
      client.on('interleaved', onFrame);
      client.once('disconnect', (error: Error) => disconnect?.(error));
      try {
        const session = await client.connect();
        this.configureSession(session, connectedOnce);
        sessionReady = true;
        for (const frame of queuedFrames) this.handleFrame(frame);
        queuedFrames.length = 0;
        connectedOnce = true;
        delayMs = this.reconnectInitialMs;
        this.setState('streaming');
        this.emit('ready', session);
        const error = await disconnected;
        throw error;
      } catch (error) {
        if (this.stopController.signal.aborted) break;
        const failure = error instanceof Error ? error : new Error(String(error));
        this.logger.warn('RTSP stream session disconnected; reconnecting.', {
          error: failure,
          reconnectDelayMs: delayMs,
        });
        this.emit('reconnecting', failure);
        if (!connectedOnce) this.emit('initial-error', failure);
        try {
          await abortableDelay(delayMs, this.stopController.signal);
        } catch {
          break;
        }
        delayMs = Math.min(delayMs * 2, this.reconnectMaximumMs);
      } finally {
        client.removeListener('interleaved', onFrame);
        await client.close().catch(() => undefined);
        if (this.currentClient === client) this.currentClient = undefined;
      }
    }
  }

  private configureSession(session: RtspClientSession, reconnect: boolean): void {
    this.tracksValue = tracksFromSession(session);
    const video = this.tracksValue.find((track) => track.mediaType === 'video');
    this.assembler = video === undefined ? undefined : new H264AccessUnitAssembler({
      payloadType: video.payloadType,
      clockRate: video.clockRate,
      ...(video.parameterSets === undefined ? {} : { parameterSets: video.parameterSets }),
    });
    this.videoReorder = new RtpReorderBuffer<MediaPacket>(4);
    this.videoSsrc = undefined;
    this.videoTimestamp = undefined;
    this.discontinuityPending = reconnect;
    if (this.pauseCount > 0) this.currentClient?.pauseMedia();
  }

  private handleFrame(frame: RtspInterleavedFrame): void {
    try {
      const arrivalTimeMs = this.now();
      const track = this.tracksValue.find(
        (candidate) => candidate.rtpChannel === frame.channel
          || candidate.rtcpChannel === frame.channel,
      );
      const isRtp = track?.rtpChannel === frame.channel;
      const rtp = isRtp ? parseRtpPacket(frame.payload) : undefined;
      const rtcpSenderReport = track?.rtcpChannel === frame.channel
        ? findRtcpSenderReport(frame.payload)
        : undefined;
      let videoDiscontinuity = false;
      if (track?.mediaType === 'video' && rtp !== undefined) {
        let timestampDelta = this.videoTimestamp === undefined
          ? 0
          : rtp.timestamp - this.videoTimestamp;
        if (timestampDelta > 0x8000_0000) timestampDelta -= 0x1_0000_0000;
        else if (timestampDelta < -0x8000_0000) timestampDelta += 0x1_0000_0000;
        videoDiscontinuity = this.discontinuityPending
          || (this.videoSsrc !== undefined && this.videoSsrc !== rtp.ssrc)
          || timestampDelta * 1000 / track.clockRate < -5_000;
      }
      const packet: MediaPacket = {
        arrivalTimeMs,
        ...(track === undefined ? {} : { track }),
        channel: frame.channel,
        rawInterleavedFrame: Buffer.concat([frame.rawHeader, frame.payload]),
        frame,
        ...(rtp === undefined ? {} : { rtp }),
        ...(rtcpSenderReport === undefined ? {} : { rtcpSenderReport }),
        discontinuity: videoDiscontinuity,
      };
      for (const subscriber of this.packetSubscribers) {
        try {
          subscriber(packet);
        } catch (error) {
          this.emit('subscriber-error', error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (track?.mediaType === 'video' && rtp !== undefined) this.handleVideoPacket(packet, rtp);
    } catch (error) {
      this.emit('packet-error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleVideoPacket(packet: MediaPacket, rtp: RtpPacket): void {
    if (packet.discontinuity) {
      this.videoReorder.reset();
      this.discontinuityPending = true;
    }
    this.videoSsrc = rtp.ssrc;
    this.videoTimestamp = rtp.timestamp;
    const result = this.videoReorder.push(rtp.sequenceNumber, {
      ...packet,
      discontinuity: packet.discontinuity || this.discontinuityPending,
    });
    for (const ordered of result.packets) {
      this.discontinuityPending = false;
      const orderedRtp = ordered.value.rtp;
      if (orderedRtp === undefined || this.assembler === undefined) continue;
      const units = this.assembler.push({
        rtp: orderedRtp,
        wallClockTimeMs: ordered.value.arrivalTimeMs,
        discontinuity: ordered.value.discontinuity,
        lostBefore: ordered.lostBefore,
      });
      for (const unit of units) {
        for (const subscriber of this.accessUnitSubscribers) {
          try {
            subscriber(unit);
          } catch (error) {
            this.emit('subscriber-error', error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    }
  }

  private setState(state: SessionState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.emit('state', state);
  }

  private waitForStreaming(signal?: AbortSignal): Promise<void> {
    if (this.stateValue === 'streaming') return Promise.resolve();
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<void>((resolve, reject) => {
      const ready = (): void => finish(resolve);
      const stopped = (): void => finish(() => reject(new Error('RTSP stream session stopped.')));
      const aborted = (): void => finish(() => reject(signal?.reason));
      const finish = (action: () => void): void => {
        this.removeListener('ready', ready);
        this.removeListener('state', stateChanged);
        signal?.removeEventListener('abort', aborted);
        action();
      };
      const stateChanged = (state: SessionState): void => {
        if (state === 'stopped') stopped();
      };
      this.once('ready', ready);
      this.on('state', stateChanged);
      signal?.addEventListener('abort', aborted, { once: true });
    });
  }
}

interface ManagedSession {
  readonly session: RtspStreamSession;
  leases: number;
  readonly startPromise: Promise<void>;
}

export class RtspSessionManager {
  private readonly sessions = new Map<string, ManagedSession>();

  constructor(private readonly options: RtspSessionManagerOptions = {}) {}

  async acquire(input: { readonly url: string; readonly signal?: AbortSignal }): Promise<RtspSessionLease> {
    const key = input.url;
    let managed = this.sessions.get(key);
    if (managed === undefined) {
      const session = new RtspStreamSession({
        url: input.url,
        ...(this.options.logger === undefined ? {} : { logger: this.options.logger }),
        ...(this.options.reconnectInitialMs === undefined
          ? {}
          : { reconnectInitialMs: this.options.reconnectInitialMs }),
        ...(this.options.reconnectMaximumMs === undefined
          ? {}
          : { reconnectMaximumMs: this.options.reconnectMaximumMs }),
        ...(this.options.clientFactory === undefined
          ? {}
          : { clientFactory: this.options.clientFactory }),
      });
      managed = { session, leases: 0, startPromise: session.start(input.signal) };
      this.sessions.set(key, managed);
    }
    managed.leases += 1;
    try {
      await managed.startPromise;
    } catch (error) {
      await this.release(key, managed);
      throw error;
    }
    let released = false;
    return {
      session: managed.session,
      release: async () => {
        if (released) return;
        released = true;
        await this.release(key, managed as ManagedSession);
      },
    };
  }

  get activeSessionCount(): number {
    return this.sessions.size;
  }

  async stop(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map(async (managed) => managed.session.stop()));
  }

  private async release(key: string, managed: ManagedSession): Promise<void> {
    managed.leases = Math.max(0, managed.leases - 1);
    if (managed.leases !== 0 || this.sessions.get(key) !== managed) return;
    this.sessions.delete(key);
    await managed.session.stop();
  }
}

export type { TrackDescription };
