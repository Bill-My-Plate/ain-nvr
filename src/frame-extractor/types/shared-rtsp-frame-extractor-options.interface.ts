import type { RtspLoopbackBridgeOptions } from '../../stream-adapters/index.js';

import { type RtspUrlFrameExtractorOptions } from './rtsp-url-frame-extractor-options.interface.js';
/**
 * Configuration options for shared Rtsp Frame Extractor.
 */
export interface SharedRtspFrameExtractorOptions extends Omit<RtspUrlFrameExtractorOptions, 'url'> {
  /** Producer of packets, bytes, or segments consumed by this operation. */
  readonly source: RtspLoopbackBridgeOptions['source'];
  /** Bridge that exposes the shared session to the decoder. */
  readonly bridge?: Omit<RtspLoopbackBridgeOptions, 'source' | 'onError'>;
}
