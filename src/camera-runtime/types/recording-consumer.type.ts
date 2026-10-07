





import { type RecordingConfiguration } from './recording-configuration.type.js';
import type { RecordingOptions } from './recording-options.interface.js';

import type { ConsumerBase } from './consumer-base.type.js';

export type RecordingConsumer = ConsumerBase & {
  kind: 'record'; options: RecordingOptions; configuration: RecordingConfiguration;
  events: Promise<void>;
  deliveryFailed: boolean;
};
