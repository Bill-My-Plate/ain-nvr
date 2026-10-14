import { ManagedCameraRuntime } from '../services/managed-camera-runtime.class.js';
/**
 * Process-wide managed runtime and ABI key stored on the global object.
 */
export type Registry = {
  /** Runtime ABI key used to detect incompatible registry instances. */
  abi: string;
  /** Managed camera runtime held by the process-wide registry. */
  runtime: ManagedCameraRuntime;
};
