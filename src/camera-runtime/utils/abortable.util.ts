





export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => { signal.removeEventListener('abort', cancel); reject(signal.reason); };
    signal.addEventListener('abort', cancel, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
