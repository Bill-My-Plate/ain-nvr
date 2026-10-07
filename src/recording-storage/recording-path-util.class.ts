import path from 'node:path';




export class RecordingPathUtil {
  public static resolveInsideRoot(root: string, ...parts: string[]): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, ...parts);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Recording path escaped its configured root.');
    }
    return resolved;
  }

  public static nativeHourStart(timeMs: number): number {
    return Math.floor(timeMs / 3_600_000) * 3_600_000;
  }
}
