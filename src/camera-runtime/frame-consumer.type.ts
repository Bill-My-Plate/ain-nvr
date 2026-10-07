





import { deferred } from './deferred.util.js';
import { type FrameProfile } from './frame-profile.type.js';
import type { FrameOptions } from './frame-options.interface.js';

import type { ConsumerBase } from './consumer-base.type.js';

export type FrameConsumer = ConsumerBase & {
  kind: 'frames'; options: FrameOptions; profile: FrameProfile;
  ready: ReturnType<typeof deferred<void>>;
  timer: NodeJS.Timeout | undefined;
  frameNumber: number;
  busy: boolean;
};
