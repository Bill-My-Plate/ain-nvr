import { type RecordingConfiguration } from '../../camera/index.js';
import type { RecordingOptions } from '../../camera/index.js';

import type { ConsumerBase } from './consumer-base.type.js';
/**
 * Recording callback and handle state attached to a camera owner.
 */
export type RecordingConsumer = ConsumerBase & {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'record';
  /** Options supplied when this consumer or command was started. */
  options: RecordingOptions;
  /** Codec or runtime configuration currently applied. */
  configuration: RecordingConfiguration;
  /** Index or status events produced by this operation. */
  events: Promise<void>;
  /** Whether delivery failed. */
  deliveryFailed: boolean;
};
