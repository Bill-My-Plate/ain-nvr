

export function decodeMuLaw(value: number): number {
  const encoded = (~value) & 0xff;
  const sign = encoded & 0x80;
  const exponent = (encoded >>> 4) & 0x07;
  const mantissa = encoded & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign === 0 ? magnitude : -magnitude;
}
