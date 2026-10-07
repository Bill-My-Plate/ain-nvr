
import type { CameraStatus } from './camera-status.interface.js';

import type { WireError } from './wire-error.type.js';
import type { RecordingEvent } from './recording-event.type.js';

export type WorkerMessage =
  | { kind: 'ready'; epoch: number; version: number; generation: number }
  | { kind: 'response'; epoch: number; id: number; error?: WireError }
  | { kind: 'fatal'; epoch: number; error: WireError; terminal: boolean }
  | { kind: 'consumer-error'; epoch: number; consumerId: string; error: WireError }
  | { kind: 'event'; epoch: number; sequence: number; consumerId: string; event: RecordingEvent }
  | { kind: 'progress'; epoch: number; consumerId: string }
  | { kind: 'status'; epoch: number; status: Omit<CameraStatus, 'lastError'> };
