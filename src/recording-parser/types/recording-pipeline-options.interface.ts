
import { type RecordingIndexEvent } from './recording-index-event.type.js';
import { type RecordingPacketWriter } from './recording-packet-writer.interface.js';
import { type RecordingParserOptions } from './recording-parser-options.interface.js';

import type { RecordingPacketSource } from './recording-packet-source.interface.js';

export interface RecordingPipelineOptions<TLocation> extends RecordingParserOptions {
  readonly source: RecordingPacketSource;
  readonly writer: RecordingPacketWriter<TLocation>;
  readonly onIndexEvents?: (
    events: readonly RecordingIndexEvent<TLocation>[],
  ) => Promise<void> | void;
  readonly onError?: (error: Error) => void;
  /** Runs after all index callbacks, even for an empty successful batch. */
  readonly onBatchComplete?: () => Promise<void> | void;
  readonly pauseAtBytes?: number;
  readonly resumeAtBytes?: number;
  readonly maximumQueuedBytes?: number;
  readonly maximumQueuedPackets?: number;
}
