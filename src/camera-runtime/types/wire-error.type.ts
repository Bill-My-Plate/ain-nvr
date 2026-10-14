/**
 * Serializable error code and message sent across a worker boundary.
 */
export type WireError = {
  /** Human-readable error description sent across the worker boundary. */
  message: string;
  /** Stable error code sent across the worker boundary. */
  code?: string;
};
