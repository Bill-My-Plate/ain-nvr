/**
 * Persisted H.264 SPS and PPS bytes for decoder setup.
 */
export type StoredParameterSets = {
  /** H.264 sequence parameter set bytes. */
  sps: string;
  /** H.264 picture parameter set bytes. */
  pps: string;
};
