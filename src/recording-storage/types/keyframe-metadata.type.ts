


import type { PlaypointMetadata } from './playpoint-metadata.type.js';

export type KeyframeMetadata = PlaypointMetadata & {
  rtpTimestamp: number;
  sequenceNumber: number;
};
