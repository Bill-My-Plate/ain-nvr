export function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, Math.max(0, milliseconds));
    timeout.unref();
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}
