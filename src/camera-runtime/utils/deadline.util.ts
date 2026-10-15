import { failure } from '../../camera/index.js';
/**
 * Bounds an asynchronous operation by a timeout and abort signal.
 */
export async function deadline<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(failure('ETIMEDOUT', message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
