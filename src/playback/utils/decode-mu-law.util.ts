import { PLAYBACK_CONSTANTS } from '../constants/playback-numeric-values.constant.js';
/**
 * Expands one G.711 mu-law byte into a signed 16-bit PCM sample.
 */
export function decodeMuLaw(value: number): number {
  const encoded = ~value & PLAYBACK_CONSTANTS.muLawByteMask;
  const sign = encoded & PLAYBACK_CONSTANTS.g711SignMask;
  const exponent =
    (encoded >>> PLAYBACK_CONSTANTS.g711ExponentShift) & PLAYBACK_CONSTANTS.g711ExponentMask;
  const mantissa = encoded & PLAYBACK_CONSTANTS.g711MantissaMask;
  const magnitude =
    (((mantissa << PLAYBACK_CONSTANTS.muLawMantissaShift) + PLAYBACK_CONSTANTS.muLawBias) <<
      exponent) -
    PLAYBACK_CONSTANTS.muLawBias;
  return sign === 0 ? magnitude : -magnitude;
}
