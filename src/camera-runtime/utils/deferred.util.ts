/**
 * Creates a promise with externally accessible resolve and reject callbacks.
 */
export function deferred<T>(): {
  /** Promise settled by this deferred value. */
  promise: Promise<T>;

  /** Callback that resolves the deferred promise. */
  resolve: (value: T) => void;

  /** Callback that rejects the deferred promise. */
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Handles remain observable without creating unhandled rejections before callers attach.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
