export function parsePayloadType(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 127) {
    throw new Error(`Invalid SDP payload type in ${field}.`);
  }
  return parsed;
}
