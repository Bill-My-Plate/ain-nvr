





export function signedTimestampDelta(timestamp: number, anchor: number): number {
  let delta = timestamp - anchor;
  if (delta > 0x8000_0000) delta -= 0x1_0000_0000;
  else if (delta < -0x8000_0000) delta += 0x1_0000_0000;
  return delta;
}
