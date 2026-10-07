import { BitReader } from './bit-reader.class.js';

export function skipScalingList(reader: BitReader, size: number): void {
  let lastScale = 8;
  let nextScale = 8;
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) {
      nextScale = (lastScale + reader.readSignedExpGolomb() + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}
