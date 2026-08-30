export interface RtspParserLimits {
  readonly maxHeaderBytes: number;
  readonly maxBodyBytes: number;
  readonly maxInterleavedPacketBytes: number;
}

export const DEFAULT_RTSP_PARSER_LIMITS: RtspParserLimits = Object.freeze({
  maxHeaderBytes: 32 * 1024,
  maxBodyBytes: 1024 * 1024,
  maxInterleavedPacketBytes: 65_535,
});

function requireIntegerInRange(
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

export function resolveRtspParserLimits(
  limits: Partial<RtspParserLimits> = {},
): RtspParserLimits {
  return Object.freeze({
    maxHeaderBytes: requireIntegerInRange(
      'maxHeaderBytes',
      limits.maxHeaderBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxHeaderBytes,
      4,
      16 * 1024 * 1024,
    ),
    maxBodyBytes: requireIntegerInRange(
      'maxBodyBytes',
      limits.maxBodyBytes ?? DEFAULT_RTSP_PARSER_LIMITS.maxBodyBytes,
      0,
      64 * 1024 * 1024,
    ),
    maxInterleavedPacketBytes: requireIntegerInRange(
      'maxInterleavedPacketBytes',
      limits.maxInterleavedPacketBytes
        ?? DEFAULT_RTSP_PARSER_LIMITS.maxInterleavedPacketBytes,
      1,
      65_535,
    ),
  });
}
