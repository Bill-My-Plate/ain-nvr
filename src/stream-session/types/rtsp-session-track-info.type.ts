


import type { TrackDescription } from '../../media/index.js';








export type RtspSessionTrackInfo = TrackDescription & {
  readonly control: string;
  readonly fmtp?: string;
};
