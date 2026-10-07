import type { RtspParserLimits } from './rtsp-parser-limits.interface.js';

export function requireIntegerInRange(
  name: keyof RtspParserLimits,
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}
