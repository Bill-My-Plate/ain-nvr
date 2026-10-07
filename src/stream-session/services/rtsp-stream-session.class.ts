import { EventEmitter } from 'node:events';
import { AinNvrError } from '../../shared/index.js';
import type { TrackDescription } from '../../media/index.js';
import { H264AccessUnitAssembler } from '../../h264/index.js';

import { parseRtpPacket, type RtpPacket } from '../../rtp-parser/index.js';
import { RtpReorderBuffer } from '../../rtp-parser/index.js';
import { findRtcpSenderReport } from '../../rtp-parser/index.js';
import { RtspClient, type RtspClientSession } from '../../rtsp-client/index.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';

import type { SessionState } from '../types/session-state.type.js';
import type { MediaPacket } from '../../media/index.js';
import type { RtspStreamSessionOptions } from '../types/rtsp-stream-session-options.interface.js';
import type { RtspSessionInfo } from '../types/rtsp-session-info.interface.js';
import type { RtspSessionSnapshot } from '../types/rtsp-session-snapshot.interface.js';
import type { PacketSubscriber } from '../types/packet-subscriber.type.js';
import type { AccessUnitSubscriber } from '../types/access-unit-subscriber.type.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { abortableDelay } from '../utils/abortable-delay.util.js';
import { sessionInfoFromSession } from '../utils/session-info-from-session.util.js';

export class RtspStreamSession extends EventEmitter {
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
  private sessionInfoValue: RtspSessionInfo | undefined;
  private assembler: H264AccessUnitAssembler | undefined;
  private videoReorder = new RtpReorderBuffer<MediaPacket>(4);
  private videoSsrc: number | undefined;
  private videoTimestamp: number | undefined;
  private discontinuityPending = false;
  private pauseCount = 0;
  private snapshotValue: RtspSessionSnapshot | undefined;
  private readonly sessionSubscribers = new Set<(snapshot: RtspSessionSnapshot) => void>();

  constructor(private readonly options: RtspStreamSessionOptions) {
    super();
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

  get snapshot(): RtspSessionSnapshot | undefined {
    return this.snapshotValue;
  }

  /** Notifications precede all media for the new generation; not replayed. */
  subscribeSessionChanges(subscriber: (snapshot: RtspSessionSnapshot) => void): () => void {
    this.sessionSubscribers.add(subscriber);
    return () => this.sessionSubscribers.delete(subscriber);
  }

  /** Available after start(), or RtspSessionManager.acquire(), resolves. */
  get sessionInfo(): RtspSessionInfo {
    if (this.sessionInfoValue === undefined) {
      throw new Error('RTSP session information is not available before the session is streaming.');
    }
    return this.sessionInfoValue;
  }

  async start(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    if (this.stopController.signal.aborted) throw this.stopController.signal.reason;
    if (this.runPromise !== undefined) {
      if (this.stateValue === 'streaming') return;
      await this.waitForStreaming(signal);
      return;
    }
    this.runPromise = this.run().finally(() => this.setState('stopped'));
    // A failed client factory must reject waiters, not leave an unhandled run promise.
    void this.runPromise.catch(() => undefined);
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
      let queuedBytes = 0;
      let startupOverflow = false;
      let overflowClose: Promise<void> | undefined;
      let sessionReady = false;
      let disconnect: ((error: Error) => void) | undefined;
      const disconnected = new Promise<Error>((resolve) => {
        disconnect = resolve;
      });
      // RtspClient intentionally suppresses disconnect events during an explicit close.
      // Wake run() on stop as well, otherwise session.stop waits on itself forever.
      const stopped = (): void => disconnect?.(new Error('RTSP stream session stopped.'));
      this.stopController.signal.addEventListener('abort', stopped, { once: true });
      const onFrame = (frame: RtspInterleavedFrame): void => {
        if (!sessionReady) {
          if (startupOverflow) return;
          queuedBytes += frame.rawHeader.length + frame.payload.length;
          if (queuedBytes > 8 * 1024 * 1024 || queuedFrames.length >= 4_096) {
            startupOverflow = true;
            queuedFrames.length = 0;
            overflowClose = client.close().catch(() => undefined);
            return;
          }
          queuedFrames.push(frame);
        }
        else this.handleFrame(frame);
      };
      client.on('interleaved', onFrame);
      client.once('disconnect', (error: Error) => disconnect?.(error));
      try {
        const session = await client.connect();
        if (startupOverflow) throw new Error('RTSP negotiation media buffer exceeded its limit.');
        if (this.stopController.signal.aborted) break;
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
        this.emit('reconnecting', failure);
        if (!connectedOnce) this.emit('initial-error', failure);
        try {
          await abortableDelay(delayMs, this.stopController.signal);
        } catch {
          break;
        }
        delayMs = Math.min(delayMs * 2, this.reconnectMaximumMs);
      } finally {
        this.stopController.signal.removeEventListener('abort', stopped);
        client.removeListener('interleaved', onFrame);
        await overflowClose;
        await client.close().catch(() => undefined);
        if (this.currentClient === client) this.currentClient = undefined;
      }
    }
  }

  private configureSession(session: RtspClientSession, reconnect: boolean): void {
    this.sessionInfoValue = sessionInfoFromSession(session);
    this.tracksValue = this.sessionInfoValue.tracks;
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
    this.snapshotValue = {
      generation: (this.snapshotValue?.generation ?? 0) + 1,
      sessionInfo: this.sessionInfoValue,
    };
    for (const subscriber of this.sessionSubscribers) {
      try {
        subscriber(this.snapshotValue);
      } catch (error) {
        this.emit('subscriber-error', error instanceof Error ? error : new Error(String(error)));
      }
    }
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
        sessionGeneration: this.snapshotValue!.generation,
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
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.stopController.signal.aborted || this.stateValue === 'stopped') {
      return Promise.reject(new Error('RTSP stream session stopped.'));
    }
    if (this.stateValue === 'streaming') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const ready = (): void => finish(resolve);
      const stopped = (): void => finish(() => reject(new Error('RTSP stream session stopped.')));
      const aborted = (): void => finish(() => reject(signal?.reason));
      const initialError = (error: Error): void => {
        if (error instanceof AinNvrError && ['unsupported_codec', 'rtsp_authentication_failed', 'rtsp_unsupported_transport'].includes(error.code)) finish(() => reject(error));
      };
      const finish = (action: () => void): void => {
        this.removeListener('ready', ready);
        this.removeListener('state', stateChanged);
        this.removeListener('initial-error', initialError);
        signal?.removeEventListener('abort', aborted);
        action();
      };
      const stateChanged = (state: SessionState): void => {
        if (state === 'stopped') stopped();
      };
      this.once('ready', ready);
      this.on('state', stateChanged);
      this.on('initial-error', initialError);
      signal?.addEventListener('abort', aborted, { once: true });
    });
  }
}
