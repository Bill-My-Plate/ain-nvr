


import type { RecordingConfiguration } from './recording-configuration.type.js';
import type { FrameProfile } from './frame-profile.type.js';

export type Command =
  | { type: 'record'; consumerId: string; options: RecordingConfiguration }
  | { type: 'frames'; consumerId: string; profile: FrameProfile }
  | { type: 'stop'; consumerId: string }
  | { type: 'boundary'; consumerId: string }
  | { type: 'close' };
