








export function signedTimestampDelta(current: number, previous: number): number {
  let delta = current - previous;
  if (delta > 0x8000_0000) delta -= 0x1_0000_0000;
  else if (delta < -0x8000_0000) delta += 0x1_0000_0000;
  return delta;
}
