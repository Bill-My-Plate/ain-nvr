import { RECORDING_STORAGE_CONSTANTS } from '../constants/recording-storage-numeric-values.constant.js';
import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
/** Publication order matches schema-1 recordings: durable media, then durable JSON. */
export class RecordingFileUtil {
  /**
   * Writes json Atomic.
   */
  public static async writeJsonAtomic(destination: string, value: unknown): Promise<void> {
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', RECORDING_STORAGE_CONSTANTS.privateFileMode);
      try {
        await handle.writeFile(
          `${JSON.stringify(value, null, RECORDING_STORAGE_CONSTANTS.jsonIndentSpaces)}\n`,
          'utf8',
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.publishFileAtomic(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Publish File Atomic.
   */
  public static async publishFileAtomic(source: string, destination: string): Promise<void> {
    await this.renameAtomic(source, destination);
    if (process.platform === 'win32') return;
    const directory = await open(dirname(destination), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  /**
   * Rename Atomic.
   */
  public static async renameAtomic(
    source: string,
    destination: string,
    platform: NodeJS.Platform = process.platform,
    renameFile: typeof rename = rename,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await renameFile(source, destination);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (
          platform !== 'win32' ||
          attempt >= RECORDING_STORAGE_CONSTANTS.maximumRenameAttempts ||
          !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')
        )
          throw error;
        await delay(
          Math.min(
            RECORDING_STORAGE_CONSTANTS.initialRenameRetryDelayMs *
              RECORDING_STORAGE_CONSTANTS.renameBackoffBase ** attempt,
            RECORDING_STORAGE_CONSTANTS.maximumRenameRetryDelayMs,
          ),
        );
      }
    }
  }
}
