


import { failure } from './failure.util.js';

export async function deadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(failure('ETIMEDOUT', message)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
