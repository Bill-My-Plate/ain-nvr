


export function deferred<T>(): {
  promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  // Handles remain observable without creating unhandled rejections before callers attach.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}
