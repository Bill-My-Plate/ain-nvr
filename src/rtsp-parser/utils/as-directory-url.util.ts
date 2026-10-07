export function asDirectoryUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
