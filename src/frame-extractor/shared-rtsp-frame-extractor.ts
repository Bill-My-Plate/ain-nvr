import type { RtspLoopbackBridgeOptions, RtspLoopbackBridgeStatus } from '../stream/rtsp-loopback-bridge.js';
import { RtspLoopbackBridge } from '../stream/rtsp-loopback-bridge.js';
import {
  RtspUrlFrameExtractor,
  type FrameExtractorState,
  type RtspUrlFrameExtractorOptions,
} from './rtsp-url-frame-extractor.js';

export interface SharedRtspFrameExtractorOptions
  extends Omit<RtspUrlFrameExtractorOptions, 'url'> {
  readonly source: RtspLoopbackBridgeOptions['source'];
  readonly bridge?: Omit<RtspLoopbackBridgeOptions, 'source' | 'logger' | 'onError'>;
}

/** Decodes a shared RTSP session through a loopback-only RTSP/RTP bridge. */
export class SharedRtspFrameExtractor {
  private readonly bridge: RtspLoopbackBridge;
  private extractor: RtspUrlFrameExtractor | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(private readonly options: SharedRtspFrameExtractorOptions) {
    this.bridge = new RtspLoopbackBridge({
      source: options.source,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
      ...(options.bridge ?? {}),
    });
  }

  get state(): FrameExtractorState {
    return this.extractor?.state ?? 'idle';
  }

  get bridgeStatus(): RtspLoopbackBridgeStatus {
    return this.bridge.status;
  }

  start(): Promise<void> {
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  async stop(): Promise<void> {
    await this.startPromise?.catch(() => undefined);
    await this.extractor?.stop();
    await this.bridge.stop();
  }

  private async startInternal(): Promise<void> {
    const url = await this.bridge.start();
    const { source: _source, bridge: _bridge, ...extractorOptions } = this.options;
    this.extractor = new RtspUrlFrameExtractor({ ...extractorOptions, url });
    this.extractor.start();
  }
}
