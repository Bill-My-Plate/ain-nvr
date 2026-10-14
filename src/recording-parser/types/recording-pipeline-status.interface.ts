import type { RecordingPipelineState } from './recording-pipeline-state.type.js';
/**
 * Current status of recording Pipeline.
 */
export interface RecordingPipelineStatus {
  /** Current lifecycle state of this component. */
  readonly state: RecordingPipelineState;
  /** Queued measured in bytes. */
  readonly queuedBytes: number;
  /** Number of packets waiting in the writer queue. */
  readonly queuedPackets: number;
  /** Number of packets successfully written. */
  readonly writtenPackets: number;
  /** Most recent failure retained for status reporting. */
  readonly lastError?: Error;
}
