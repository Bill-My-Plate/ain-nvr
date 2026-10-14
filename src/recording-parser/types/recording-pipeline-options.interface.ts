import { type RecordingIndexEvent } from './recording-index-event.type.js';
import { type RecordingPacketWriter } from './recording-packet-writer.interface.js';
import { type RecordingParserOptions } from './recording-parser-options.interface.js';

import type { RecordingPacketSource } from './recording-packet-source.interface.js';
/**
 * Configuration options for recording Pipeline.
 */
export interface RecordingPipelineOptions<TLocation> extends RecordingParserOptions {
  /** Producer of packets, bytes, or segments consumed by this operation. */
  readonly source: RecordingPacketSource;
  /** Sink that writes packet bytes and returns their storage locations. */
  readonly writer: RecordingPacketWriter<TLocation>;
  /** Callback invoked when index events occurs. */
  readonly onIndexEvents?: (
    events: readonly RecordingIndexEvent<TLocation>[],
  ) => Promise<void> | void;
  /** Callback invoked when the operation fails. */
  readonly onError?: (error: Error) => void;
  /** Runs after all index callbacks, even for an empty successful batch. */
  readonly onBatchComplete?: () => Promise<void> | void;
  /** Pause at measured in bytes. */
  readonly pauseAtBytes?: number;
  /** Resume at measured in bytes. */
  readonly resumeAtBytes?: number;
  /** Maximum queued measured in bytes. */
  readonly maximumQueuedBytes?: number;
  /** Upper bound for queued packets. */
  readonly maximumQueuedPackets?: number;
}
