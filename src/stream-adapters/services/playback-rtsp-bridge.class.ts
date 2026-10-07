
import type { PlaybackMessage } from '../../playback/index.js';
import { RtpPacketizer } from './rtp-packetizer.class.js';
import { PlaybackRtspServer } from './playback-rtsp-server.class.js';

import type { PlaybackVideoMessage } from '../types/playback-video-message.type.js';
import type { PlaybackRtspBridgeOptions } from '../types/playback-rtsp-bridge-options.interface.js';
import type { PlaybackRtspBridgeStart } from '../types/playback-rtsp-bridge-start.interface.js';
import { prependMessage } from '../utils/prepend-message.util.js';

export class PlaybackRtspBridge {
  // FFmpeg treats an RTP-Info origin of zero as unset. A small nonzero origin
  // also avoids wrapping before a delayed track sends its first packet.
  private readonly videoPacketizer = new RtpPacketizer({
    payloadType: 96, clockRate: 90_000, initialTimestamp: 1,
  });
  private readonly audioPacketizer: RtpPacketizer | undefined;
  private server: PlaybackRtspServer | undefined;
  private firstVideo: PlaybackVideoMessage | undefined;
  private startValue: PlaybackRtspBridgeStart | undefined;
  private startPromise: Promise<PlaybackRtspBridgeStart> | undefined;
  private runPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  constructor(private readonly options: PlaybackRtspBridgeOptions) {
    if (options.endTimeMs !== undefined
      && (!Number.isSafeInteger(options.endTimeMs) || options.endTimeMs < 0)) {
      throw new RangeError('endTimeMs must be a non-negative safe integer.');
    }
    if (options.audioSampleRate !== undefined
      && (!Number.isSafeInteger(options.audioSampleRate) || options.audioSampleRate <= 0)) {
      throw new RangeError('audioSampleRate must be a positive safe integer.');
    }
    if (options.playTimeoutMs !== undefined
      && (!Number.isSafeInteger(options.playTimeoutMs) || options.playTimeoutMs <= 0)) {
      throw new RangeError('playTimeoutMs must be a positive safe integer.');
    }
    this.audioPacketizer = options.audioSampleRate === undefined
      ? undefined
      : new RtpPacketizer({
        payloadType: 97, clockRate: options.audioSampleRate, initialTimestamp: 1,
      });
  }

  get started(): PlaybackRtspBridgeStart | undefined {
    return this.startValue;
  }

  start(): Promise<PlaybackRtspBridgeStart> {
    if (this.stopPromise !== undefined) {
      return Promise.reject(new Error('Playback RTSP bridge is stopped.'));
    }
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  run(): Promise<void> {
    if (this.stopPromise !== undefined) {
      return Promise.reject(new Error('Playback RTSP bridge is stopped.'));
    }
    this.runPromise ??= this.runInternal();
    return this.runPromise;
  }

  stop(): Promise<void> {
    this.stopPromise ??= this.stopInternal();
    return this.stopPromise;
  }

  private async startInternal(): Promise<PlaybackRtspBridgeStart> {
    this.throwIfAborted();
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
        ...(this.options.logger === undefined ? {} : { logger: this.options.logger }),
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

  private async runInternal(): Promise<void> {
    const started = await this.start();
    const server = this.server;
    const firstVideo = this.firstVideo;
    if (server === undefined || firstVideo === undefined) {
      throw new Error('Playback RTSP bridge failed to initialize.');
    }

    try {
      await server.waitForPlay(this.options.signal, this.options.playTimeoutMs);
      await this.replay(
        prependMessage(firstVideo, this.options.playback),
        server,
        started.actualStartTimeMs,
      );
      await server.finish();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  private async replay(
    playback: AsyncGenerator<PlaybackMessage>,
    server: PlaybackRtspServer,
    actualStartTimeMs: number,
  ): Promise<void> {
    const video = this.videoPacketizer;
    const audio = this.audioPacketizer;
    let sentVideo = false;

    for await (const message of playback) {
      this.throwIfAborted();
      if (message.kind !== 'video' && message.kind !== 'audio') continue;
      if (message.kind === 'video' && this.atOrAfterEnd(message.wallClockTimeMs)) break;
      if (message.kind === 'audio' && this.atOrAfterEnd(message.wallClockTimeMs)) continue;
      const timestampUs = Math.max(
        0,
        Math.round((message.wallClockTimeMs - actualStartTimeMs) * 1_000),
      );

      if (message.kind === 'video') {
        const packets = video.packetizeH264(message.data, timestampUs);
        for (const packet of packets) await server.sendVideo(packet);
        if (packets.length > 0) sentVideo = true;
        continue;
      }

      if (audio !== undefined) {
        if (message.sampleFormat !== 's16le'
          || message.sampleRate !== this.options.audioSampleRate
          || message.channels !== 1) {
          throw new Error('Playback audio format changed during RTSP bridging.');
        }
        for (const packet of audio.packetizePcmS16Le(message.data, timestampUs)) {
          await server.sendAudio(packet);
        }
      }
    }

    if (!sentVideo) {
      throw new Error('Playback interval contains no exportable video frames.');
    }
  }

  private async stopInternal(): Promise<void> {
    await this.options.playback.return(undefined).catch(() => undefined);
    await this.server?.stop();
    this.server = undefined;
    this.firstVideo = undefined;
  }

  private atOrAfterEnd(wallClockTimeMs: number): boolean {
    return this.options.endTimeMs !== undefined
      && wallClockTimeMs >= this.options.endTimeMs;
  }

  private throwIfAborted(): void {
    if (this.options.signal?.aborted === true) {
      throw this.options.signal.reason instanceof Error
        ? this.options.signal.reason
        : new Error('Playback RTSP bridge aborted.');
    }
  }
}
