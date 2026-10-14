import { deferred } from '../utils/deferred.util.js';
/**
 * Common identifier and completion state held by camera consumers.
 */
export type ConsumerBase = {
  /** Identifier used to match this request, resource, or response. */
  id: string;
  /** Whether this consumer is still attached to the camera. */
  active: boolean;
  /** Promise settled when this operation has finished. */
  completion: ReturnType<typeof deferred<void>>;
  /** Promise shared by callers waiting for consumer shutdown. */
  stopping?: Promise<void>;
};
