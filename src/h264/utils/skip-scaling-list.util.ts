import { BitReader } from '../services/bit-reader.class.js';
import { H264_SCALING_LIST_LAYOUT } from '../constants/h264-scaling-list-layout.constant.js';

/**
 * Consume an SPS scaling list without storing it; dimension parsing only
 * needs the reader positioned after the list. `size` is its entry count.
 */
export function skipScalingList(reader: BitReader, size: number): void {
  let lastScale: number = H264_SCALING_LIST_LAYOUT.defaultScale;
  let nextScale: number = H264_SCALING_LIST_LAYOUT.defaultScale;
  // Delta scales are signed Exp-Golomb values; a zero next scale repeats the
  // previous scale for the remainder of the list.
  for (let index = 0; index < size; index += 1) {
    if (nextScale !== 0) {
      nextScale = (lastScale + reader.readSignedExpGolomb()
        + H264_SCALING_LIST_LAYOUT.scaleModulus) % H264_SCALING_LIST_LAYOUT.scaleModulus;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}
