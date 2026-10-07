export function parseAttribute(line: string): readonly [string, string] {
  const separator = line.indexOf(':');
  return separator < 0
    ? [line.trim().toLowerCase(), '']
    : [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()];
}
