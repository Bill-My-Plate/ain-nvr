import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Publication order matches schema-1 recordings: durable media, then durable JSON. */
export class RecordingFileUtil {
  static async writeJsonAtomic(destination: string, value: unknown): Promise<void> {
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

  static async publishFileAtomic(source: string, destination: string): Promise<void> {
    await this.renameAtomic(source, destination);
    if (process.platform === 'win32') return;
    const directory = await open(dirname(destination), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  static async renameAtomic(
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
        if (platform !== 'win32' || attempt >= 8
          || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
        await delay(Math.min(25 * 2 ** attempt, 1_200));
      }
    }
  }
}
