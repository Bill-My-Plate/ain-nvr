


export function requireUint(value: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}.`);
  }
  return value;
}
