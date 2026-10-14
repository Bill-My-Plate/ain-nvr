import type { CameraStatus } from './camera-status.interface.js';

import type { WireError } from './wire-error.type.js';
import type { RecordingEvent } from './recording-event.type.js';
/**
 * Event, status, or error sent by a camera worker to its host.
 */
export type WorkerMessage =
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'ready';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /** Version of the worker message protocol. */
      version: number;
      /** Stream generation, advanced when the underlying RTSP session changes. */
      generation: number;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'response';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /** Identifier used to match this request, resource, or response. */
      id: number;
      /** Failure associated with this event or operation. */
      error?: WireError;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'fatal';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /** Failure associated with this event or operation. */
      error: WireError;
      /** Whether terminal. */
      terminal: boolean;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'consumer-error';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
      /** Failure associated with this event or operation. */
      error: WireError;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'event';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /** Sequence number used to match messages with acknowledgements. */
      sequence: number;
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
      /** Recording or frame event forwarded from the worker. */
      event: RecordingEvent;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'progress';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /**
       * Identifier of the recording or frame consumer.
       */
      consumerId: string;
    }
  | {
      /** Discriminant identifying this command, event, or message variant. */
      kind: 'status';
      /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
      epoch: number;
      /** Camera status snapshot sent by the worker. */
      status: Omit<CameraStatus, 'lastError'>;
    };
