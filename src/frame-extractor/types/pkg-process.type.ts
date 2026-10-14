/**
 * Process fields used to detect the pkg executable environment.
 */
export type PkgProcess = NodeJS.Process & {
  /** Marker set when running inside a pkg executable. */
  pkg?: unknown;
};
