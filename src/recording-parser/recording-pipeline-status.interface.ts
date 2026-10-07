


import type { RecordingPipelineState } from './recording-pipeline-state.type.js';

export interface RecordingPipelineStatus {
  readonly state: RecordingPipelineState;
  readonly queuedBytes: number;
  readonly queuedPackets: number;
  readonly writtenPackets: number;
  readonly lastError?: Error;
}
