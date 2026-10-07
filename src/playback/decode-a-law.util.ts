

export function decodeALaw(value: number): number {
  const encoded = value ^ 0x55;
  const sign = encoded & 0x80;
  const exponent = (encoded >>> 4) & 0x07;
  const mantissa = encoded & 0x0f;
  let magnitude = mantissa << 4;
  if (exponent === 0) {
    magnitude += 8;
  } else {
    magnitude += 0x108;
    magnitude <<= exponent - 1;
  }
  return sign === 0 ? -magnitude : magnitude;
}
