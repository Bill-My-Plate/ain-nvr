import { createHash } from 'node:crypto';

/** Return the hexadecimal MD5 digest required by RTSP Digest authentication. */
export function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex');
}
