export {
  decoderCandidates,
  detectDecoderHostCapabilities,
  isSaneFrame,
  selectDecoder,
  type DecoderCandidate,
  type DecoderHostCapabilities,
  type DecoderSelection,
} from '../frame-extractor/index.js';
export { FrameSampler } from '../frame-extractor/index.js';
export {
  RtspUrlFrameExtractor,
  type ExtractedJpegFrame,
  type FrameExtractorState,
  type RtspUrlFrameExtractorOptions,
} from '../frame-extractor/index.js';
export {
  createScryptedLibavRuntime,
  isScryptedLibavAvailable,
  preloadScryptedLibavNativeAddon,
} from '../frame-extractor/index.js';
export {
  SharedRtspFrameExtractor,
  type SharedRtspFrameExtractorOptions,
} from '../frame-extractor/index.js';
export type * from '../frame-extractor/index.js';
