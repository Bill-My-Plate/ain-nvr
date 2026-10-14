import { deferred } from '../utils/deferred.util.js';
import { type FrameProfile } from './frame-profile.type.js';
import type { FrameOptions } from './frame-options.interface.js';

import type { ConsumerBase } from './consumer-base.type.js';
/**
 * Subscriber callback, lifecycle, and frame accounting state.
 */
export type FrameConsumer = ConsumerBase & {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'frames';
  /** Options supplied when this consumer or command was started. */
  options: FrameOptions;
  /** Frame decoding and sampling profile. */
  profile: FrameProfile;
  /** Promise settled when startup has completed. */
  ready: ReturnType<typeof deferred<void>>;
  /** Timeout that bounds this pending frame callback. */
  timer: NodeJS.Timeout | undefined;
  /** Monotonic frame number within this stream. */
  frameNumber: number;
  /** Whether a previous frame callback has not finished. */
  busy: boolean;
};
