export function forwardDistance(from: number, to: number): number {
  return (to - from) & 0xffff;
}
