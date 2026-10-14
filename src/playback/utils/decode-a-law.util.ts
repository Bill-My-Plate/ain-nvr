import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
/**
 * Expands one G.711 A-law byte into a signed 16-bit PCM sample.
 */
export function decodeALaw(value: number): number {
  const encoded = value ^ PLAYBACK_CONSTANTS.aLawAlternatingBitMask;
  const sign = encoded & PLAYBACK_CONSTANTS.g711SignMask;
  const exponent =
    (encoded >>> PLAYBACK_CONSTANTS.g711ExponentShift) & PLAYBACK_CONSTANTS.g711ExponentMask;
  const mantissa = encoded & PLAYBACK_CONSTANTS.g711MantissaMask;
  let magnitude = mantissa << PLAYBACK_CONSTANTS.aLawMantissaShift;
  if (exponent === 0) {
    magnitude += PLAYBACK_CONSTANTS.aLawLowSegmentBias;
  } else {
    magnitude += PLAYBACK_CONSTANTS.aLawBias;
    magnitude <<= exponent - 1;
  }
  return sign === 0 ? -magnitude : magnitude;
}
