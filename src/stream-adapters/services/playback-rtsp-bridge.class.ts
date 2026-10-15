import { STREAM_ADAPTER_CONSTANTS } from '../constants/stream-adapters-numeric-values.constant.js';
import { RtpPacketizer } from './rtp-packetizer.class.js';
import { PlaybackRtspServer } from './playback-rtsp-server.class.js';

import type { PlaybackVideoMessage } from '../types/playback-video-message.type.js';
import type { PlaybackRtspBridgeOptions } from '../types/playback-rtsp-bridge-options.interface.js';
import type { PlaybackRtspBridgeStart } from '../types/playback-rtsp-bridge-start.interface.js';
import { prependMessage } from '../utils/prepend-message.util.js';
import { replayPlaybackRtsp } from '../utils/replay-playback-rtsp.util.js';
import { throwIfPlaybackAborted } from '../utils/throw-if-playback-aborted.util.js';

/**
 * Feeds recorded playback media to a local RTSP server and owns its lifecycle.
 */
export class PlaybackRtspBridge {
  // FFmpeg treats an RTP-Info origin of zero as unset. A small nonzero origin
  // also avoids wrapping before a delayed track sends its first packet.
  private readonly videoPacketizer = new RtpPacketizer({
    payloadType: STREAM_ADAPTER_CONSTANTS.videoPayloadType,
    clockRate: STREAM_ADAPTER_CONSTANTS.videoClockRate,
    initialTimestamp: 1,
  });
  private readonly audioPacketizer: RtpPacketizer | undefined;
  private server: PlaybackRtspServer | undefined;
  private firstVideo: PlaybackVideoMessage | undefined;
  private startValue: PlaybackRtspBridgeStart | undefined;
  private startPromise: Promise<PlaybackRtspBridgeStart> | undefined;
  private runPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(private readonly options: PlaybackRtspBridgeOptions) {
    if (
      options.endTimeMs !== undefined &&
      (!Number.isSafeInteger(options.endTimeMs) || options.endTimeMs < 0)
    ) {
      throw new RangeError('endTimeMs must be a non-negative safe integer.');
    }
    if (
      options.audioSampleRate !== undefined &&
      (!Number.isSafeInteger(options.audioSampleRate) || options.audioSampleRate <= 0)
    ) {
      throw new RangeError('audioSampleRate must be a positive safe integer.');
    }
    if (
      options.playTimeoutMs !== undefined &&
      (!Number.isSafeInteger(options.playTimeoutMs) || options.playTimeoutMs <= 0)
    ) {
      throw new RangeError('playTimeoutMs must be a positive safe integer.');
    }
    this.audioPacketizer =
      options.audioSampleRate === undefined
        ? undefined
        : new RtpPacketizer({
            payloadType: STREAM_ADAPTER_CONSTANTS.audioPayloadType,
            clockRate: options.audioSampleRate,
            initialTimestamp: 1,
          });
  }

  /**
   * Returns startup metadata once the bridge is ready.
   */
  public get started(): PlaybackRtspBridgeStart | undefined {
    return this.startValue;
  }

  /**
   * Starts the operation and initializes its resources.
   */
  public start(): Promise<PlaybackRtspBridgeStart> {
    if (this.stopPromise !== undefined) {
      return Promise.reject(new Error('Playback RTSP bridge is stopped.'));
    }
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  /**
   * Runs the operation until completion or cancellation.
   */
  public run(): Promise<void> {
    if (this.stopPromise !== undefined) {
      return Promise.reject(new Error('Playback RTSP bridge is stopped.'));
    }
    this.runPromise ??= this.runInternal();
    return this.runPromise;
  }

  /**
   * Stops active work and releases owned resources.
   */
  public stop(): Promise<void> {
    this.stopPromise ??= this.stopInternal();
    return this.stopPromise;
  }

  /**
   * Reads playback configuration and the first safe video frame before opening the RTSP server.
   */
  private async startInternal(): Promise<PlaybackRtspBridgeStart> {
    throwIfPlaybackAborted(this.options.signal);
    try {
      const ready = await this.options.playback.next();
      if (ready.done || ready.value.kind !== 'ready') {
        throw new Error('Playback did not produce decoder configuration first.');
      }
      const firstVideo = await this.options.playback.next();
      if (firstVideo.done || firstVideo.value.kind !== 'video') {
        throw new Error('Playback did not produce a decoder-safe video frame after ready.');
      }
      this.firstVideo = firstVideo.value;
      this.server = new PlaybackRtspServer({
        configuration: ready.value.configuration,
        videoRtpInfo: this.videoPacketizer,
        ...(this.audioPacketizer === undefined ? {} : { audioRtpInfo: this.audioPacketizer }),
        ...(this.options.audioSampleRate === undefined
          ? {}
          : { audioSampleRate: this.options.audioSampleRate }),
        ...(this.options.maximumQueuedBytes === undefined
          ? {}
          : { maximumQueuedBytes: this.options.maximumQueuedBytes }),
      });
      const url = await this.server.start();
      this.startValue = {
        url,
        requestedStartTimeMs: ready.value.requestedTimeMs,
        actualStartTimeMs: Math.round(firstVideo.value.wallClockTimeMs),
      };
      return this.startValue;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /**
   * Waits for an RTSP client, replays media, and closes the server on completion.
   */
  private async runInternal(): Promise<void> {
    const started = await this.start();
    const server = this.server;
    const firstVideo = this.firstVideo;
    if (server === undefined || firstVideo === undefined) {
      throw new Error('Playback RTSP bridge failed to initialize.');
    }

    try {
      await server.waitForPlay(this.options.signal, this.options.playTimeoutMs);
      await replayPlaybackRtsp({
        playback: prependMessage(firstVideo, this.options.playback),
        server,
        videoPacketizer: this.videoPacketizer,
        ...(this.audioPacketizer === undefined
          ? {}
          : { audioPacketizer: this.audioPacketizer }),
        actualStartTimeMs: started.actualStartTimeMs,
        ...(this.options.endTimeMs === undefined
          ? {}
          : { endTimeMs: this.options.endTimeMs }),
        ...(this.options.audioSampleRate === undefined
          ? {}
          : { audioSampleRate: this.options.audioSampleRate }),
        ...(this.options.signal === undefined
          ? {}
          : { signal: this.options.signal }),
      });
      await server.finish();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /**
   * Closes the playback generator and its local RTSP server.
   */
  private async stopInternal(): Promise<void> {
    await this.options.playback.return(undefined).catch(() => undefined);
    await this.server?.stop();
    this.server = undefined;
    this.firstVideo = undefined;
  }
}
