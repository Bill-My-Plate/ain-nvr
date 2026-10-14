import { EventEmitter } from 'node:events';
import { AinNvrError } from '../../shared/index.js';
import type { TrackDescription } from '../../media/index.js';
import { RtspClient, type RtspClientSession } from '../../rtsp-client/index.js';
import type { RtspInterleavedFrame } from '../../rtsp-parser/index.js';

import type { SessionState } from '../types/session-state.type.js';
import type { RtspStreamSessionOptions } from '../types/rtsp-stream-session-options.interface.js';
import type { RtspSessionInfo } from '../types/rtsp-session-info.interface.js';
import type { RtspSessionSnapshot } from '../types/rtsp-session-snapshot.interface.js';
import type { PacketSubscriber } from '../types/packet-subscriber.type.js';
import type { AccessUnitSubscriber } from '../types/access-unit-subscriber.type.js';
import { positiveInteger } from '../utils/positive-integer.util.js';
import { abortableDelay } from '../utils/abortable-delay.util.js';
import { sessionInfoFromSession } from '../utils/session-info-from-session.util.js';
import { DEFAULT_RECONNECT_INITIAL_MS } from '../constants/default-reconnect-initial-ms.constant.js';
import { DEFAULT_RECONNECT_MAXIMUM_MS } from '../constants/default-reconnect-maximum-ms.constant.js';
import { RECONNECT_BACKOFF_FACTOR } from '../constants/reconnect-backoff-factor.constant.js';
import { MAX_STARTUP_BUFFER_BYTES } from '../constants/max-startup-buffer-bytes.constant.js';
import { MAX_STARTUP_FRAMES } from '../constants/max-startup-frames.constant.js';
import { RtspMediaProcessor } from './rtsp-media-processor.class.js';
/** Maintains one reconnecting RTSP stream and publishes negotiated media generations. */
export class RtspStreamSession extends EventEmitter {
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaximumMs: number;
  private readonly clientFactory: (url: string) => RtspClient;
  private readonly mediaProcessor: RtspMediaProcessor;
  private readonly stopController = new AbortController();
  private runPromise: Promise<void> | undefined;
  private currentClient: RtspClient | undefined;
  private stateValue: SessionState = 'idle';
  private tracksValue: readonly TrackDescription[] = [];
  private sessionInfoValue: RtspSessionInfo | undefined;
  private pauseCount = 0;
  private snapshotValue: RtspSessionSnapshot | undefined;
  private readonly sessionSubscribers = new Set<(snapshot: RtspSessionSnapshot) => void>();
/** Validates retry settings and initializes a client factory and arrival clock. */
  public constructor(private readonly options: RtspStreamSessionOptions) {
    super();
    this.reconnectInitialMs = positiveInteger(
      options.reconnectInitialMs,
      DEFAULT_RECONNECT_INITIAL_MS,
      'reconnectInitialMs',
    );
    this.reconnectMaximumMs = positiveInteger(
      options.reconnectMaximumMs,
      DEFAULT_RECONNECT_MAXIMUM_MS,
      'reconnectMaximumMs',
    );
    this.clientFactory = options.clientFactory ?? ((url) => new RtspClient({ url }));
    this.mediaProcessor = new RtspMediaProcessor(
      options.now ?? Date.now,
      (error) => { this.emit('packet-error', error); },
      (error) => { this.emit('subscriber-error', error); },
    );
  }

  /** Current connection lifecycle state. */
  public get state(): SessionState {
    return this.stateValue;
  }

  /** Track descriptions from the most recently negotiated connection. */
  public get tracks(): readonly TrackDescription[] {
    return this.tracksValue;
  }

  /** Latest successful generation, if the camera has connected. */
  public get snapshot(): RtspSessionSnapshot | undefined {
    return this.snapshotValue;
  }

  /** Subscribes to future generation changes before their media is published; does not replay. */
  public subscribeSessionChanges(subscriber: (snapshot: RtspSessionSnapshot) => void): () => void {
    this.sessionSubscribers.add(subscriber);
    return () => this.sessionSubscribers.delete(subscriber);
  }

  /** Returns negotiated SDP and tracks after start or manager acquisition resolves. */
  public get sessionInfo(): RtspSessionInfo {
    if (this.sessionInfoValue === undefined) {
      throw new Error('RTSP session information is not available before the session is streaming.');
    }
    return this.sessionInfoValue;
  }

  /** Starts the reconnect loop once and waits for this caller's first streaming state. */
  public async start(signal?: AbortSignal): Promise<void> {
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

  /** Aborts reconnection, closes the current client, and waits for loop cleanup. */
  public async stop(): Promise<void> {
    if (!this.stopController.signal.aborted) {
      this.stopController.abort(new Error('RTSP stream session stopped.'));
    }
    await this.currentClient?.close().catch(() => undefined);
    await this.runPromise;
    this.setState('stopped');
  }

  /** Subscribes to complete interleaved frames after their RTP or RTCP payload is parsed. */
  public subscribeMediaPackets(subscriber: PacketSubscriber): () => void {
    return this.mediaProcessor.subscribeMediaPackets(subscriber);
  }

  /** Subscribes to assembled video access units after RTP reordering. */
  public subscribeVideoAccessUnits(subscriber: AccessUnitSubscriber): () => void {
    return this.mediaProcessor.subscribeVideoAccessUnits(subscriber);
  }

  /** Adds a pause request; the underlying client pauses on the first request. */
  public pauseMedia(): void {
    this.pauseCount += 1;
    if (this.pauseCount === 1) this.currentClient?.pauseMedia();
  }

  /** Removes a pause request; the client resumes when the count reaches zero. */
  public resumeMedia(): void {
    if (this.pauseCount === 0) return;
    this.pauseCount -= 1;
    if (this.pauseCount === 0) this.currentClient?.resumeMedia();
  }

  /** Reconnects until stopped, buffering early frames until their channels are known. */
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
          if (queuedBytes > MAX_STARTUP_BUFFER_BYTES || queuedFrames.length >= MAX_STARTUP_FRAMES) {
            startupOverflow = true;
            queuedFrames.length = 0;
            overflowClose = client.close().catch(() => undefined);
            return;
          }
          queuedFrames.push(frame);
        }
        else this.mediaProcessor.handleFrame(frame);
      };
      client.on('interleaved', onFrame);
      client.once('disconnect', (error: Error) => disconnect?.(error));
      try {
        const session = await client.connect();
        if (startupOverflow) throw new Error('RTSP negotiation media buffer exceeded its limit.');
        if (this.stopController.signal.aborted) break;
        // Publish the new track map before draining media received during SETUP/PLAY.
        this.configureSession(session, connectedOnce);
        sessionReady = true;
        for (const frame of queuedFrames) this.mediaProcessor.handleFrame(frame);
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
        delayMs = Math.min(delayMs * RECONNECT_BACKOFF_FACTOR, this.reconnectMaximumMs);
      } finally {
        this.stopController.signal.removeEventListener('abort', stopped);
        client.removeListener('interleaved', onFrame);
        await overflowClose;
        await client.close().catch(() => undefined);
        if (this.currentClient === client) this.currentClient = undefined;
      }
    }
  }

  /** Replaces negotiated tracks and resets video state for a new connection. */
  private configureSession(session: RtspClientSession, reconnect: boolean): void {
    this.sessionInfoValue = sessionInfoFromSession(session);
    this.tracksValue = this.sessionInfoValue.tracks;
    const generation = (this.snapshotValue?.generation ?? 0) + 1;
    this.mediaProcessor.configure(this.tracksValue, generation, reconnect);
    if (this.pauseCount > 0) this.currentClient?.pauseMedia();
    this.snapshotValue = {
      generation,
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

  /** Emits a state change only when the lifecycle state actually changes. */
  private setState(state: SessionState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.emit('state', state);
  }

  /** Waits independently for ready, stop, abort, or a terminal initial error. */
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
