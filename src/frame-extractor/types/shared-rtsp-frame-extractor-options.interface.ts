import type { RtspLoopbackBridgeOptions } from '../../stream-adapters/index.js';

import { type RtspUrlFrameExtractorOptions } from './rtsp-url-frame-extractor-options.interface.js';

export interface SharedRtspFrameExtractorOptions
  extends Omit<RtspUrlFrameExtractorOptions, 'url'> {
  readonly source: RtspLoopbackBridgeOptions['source'];
  readonly bridge?: Omit<RtspLoopbackBridgeOptions, 'source' | 'logger' | 'onError'>;
}
