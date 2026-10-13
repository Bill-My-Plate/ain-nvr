/** Quote and escape a Digest authorization parameter. */
export function quote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
