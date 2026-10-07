

export function parseParameters(value: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"((?:\\.|[^"])*)"|([^,\s]+))/gu;
  for (const match of value.matchAll(pattern)) {
    const name = (match[1] ?? '').toLowerCase();
    const raw = match[2] ?? match[3] ?? '';
    result.set(name, raw.replace(/\\([\\"])/gu, '$1'));
  }
  return result;
}
