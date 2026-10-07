











export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, milliseconds);
    timeout.unref();
    const aborted = (): void => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener('abort', aborted, { once: true });
  });
}
