import type { SdpMediaDescription } from './sdp-media-description.interface.js';

export interface SdpDescription {
  readonly raw: string;
  readonly sessionControl?: string;
  readonly sessionAttributes: ReadonlyMap<string, readonly string[]>;
  readonly media: readonly SdpMediaDescription[];
}
