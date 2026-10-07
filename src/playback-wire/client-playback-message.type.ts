import type { OpenMessage } from './open-message.type.js';
import type { SeekMessage } from './seek-message.type.js';
import type { PauseMessage } from './pause-message.type.js';
import type { ResumeMessage } from './resume-message.type.js';
import type { CloseMessage } from './close-message.type.js';
import type { AckMessage } from './ack-message.type.js';
import type { MetricMessage } from './metric-message.type.js';
import type { ClientErrorMessage } from './client-error-message.type.js';

export type ClientPlaybackMessage = OpenMessage | SeekMessage | PauseMessage
  | ResumeMessage | CloseMessage | AckMessage | MetricMessage | ClientErrorMessage;
