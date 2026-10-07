


export function failure(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
