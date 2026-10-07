


export function validNal(nal: Buffer, expectedType: number): boolean {
  const header = nal[0];
  return header !== undefined && (header & 0x80) === 0 && (header & 0x1f) === expectedType;
}
