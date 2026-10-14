import type { Command } from './command.type.js';
/**
 * Host-to-worker command tagged with request ID and worker epoch.
 */
export type Request = {
  /** Discriminant identifying this command, event, or message variant. */
  kind: 'request';
  /** Worker lifetime identifier used to reject messages from an earlier worker instance. */
  epoch: number;
  /** Identifier used to match this request, resource, or response. */
  id: number;
  /** Camera operation requested from the worker. */
  command: Command;
};
