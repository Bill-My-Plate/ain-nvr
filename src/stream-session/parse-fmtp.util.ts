











export function parseFmtp(value: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const field of value?.split(';') ?? []) {
    const separator = field.indexOf('=');
    if (separator >= 0) {
      result.set(
        field.slice(0, separator).trim().toLowerCase(),
        field.slice(separator + 1).trim(),
      );
    }
  }
  return result;
}
