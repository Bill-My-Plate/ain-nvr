import type { RtspLoopbackBridgeStatus } from '../../stream-adapters/index.js';
import { RtspLoopbackBridge } from '../../stream-adapters/index.js';
import { RtspUrlFrameExtractor } from './rtsp-url-frame-extractor.class.js';
import { type FrameExtractorState } from '../types/frame-extractor-state.type.js';

import type { SharedRtspFrameExtractorOptions } from '../types/shared-rtsp-frame-extractor-options.interface.js';
/** Decodes a shared RTSP session through a loopback-only RTSP/RTP bridge. */
export class SharedRtspFrameExtractor {
  private readonly bridge: RtspLoopbackBridge;
  private extractor: RtspUrlFrameExtractor | undefined;
  private startPromise: Promise<void> | undefined;
  /**
   * Creates the instance and initializes its state.
   */
  public constructor(private readonly options: SharedRtspFrameExtractorOptions) {
    this.bridge = new RtspLoopbackBridge({
      source: options.source,
      ...(options.onError === undefined ? {} : { onError: options.onError }),
      ...(options.bridge ?? {}),
    });
  }

  /**
   * Returns the current lifecycle state.
   */
  public get state(): FrameExtractorState {
    return this.extractor?.state ?? 'idle';
  }

  /**
   * Returns the loopback bridge listener and client status.
   */
  public get bridgeStatus(): RtspLoopbackBridgeStatus {
    return this.bridge.status;
  }

  /**
   * Starts the operation and initializes its resources.
   */
  public start(): Promise<void> {
    this.startPromise ??= this.startInternal();
    return this.startPromise;
  }

  /**
   * Stops active work and releases owned resources.
   */
  public async stop(): Promise<void> {
    await this.startPromise?.catch(() => undefined);
    try {
      await this.extractor?.stop();
    } finally {
      await this.bridge.stop();
    }
  }

  /**
   * Start Internal.
   */
  private async startInternal(): Promise<void> {
    try {
      const url = await this.bridge.start();
      const { source: _source, bridge: _bridge, ...extractorOptions } = this.options;
      this.extractor = new RtspUrlFrameExtractor({ ...extractorOptions, url });
      this.extractor.start();
    } catch (error) {
      await this.bridge.stop();
      throw error;
    }
  }
}
