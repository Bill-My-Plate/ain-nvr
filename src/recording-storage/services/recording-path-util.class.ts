import { RECORDING_STORAGE_CONSTANTS } from '../constants/recording-storage-numeric-values.constant.js';
import path from 'node:path';
/**
 * Builds stable paths and time buckets for recording segments.
 */
export class RecordingPathUtil {
  /**
   * Resolve Inside Root.
   */
  public static resolveInsideRoot(root: string, ...parts: string[]): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...parts);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Recording path escaped its configured root.');
    }
    return resolved;
  }

  /**
   * Native Hour Start.
   */
  public static nativeHourStart(timeMs: number): number {
    return (
      Math.floor(timeMs / RECORDING_STORAGE_CONSTANTS.millisecondsPerHour) *
      RECORDING_STORAGE_CONSTANTS.millisecondsPerHour
    );
  }
}
