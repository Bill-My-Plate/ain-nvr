


import type { StartCode } from '../types/start-code.type.js';

export function findStartCodes(data: Buffer): StartCode[] {
  const result: StartCode[] = [];
  for (let offset = 0; offset + 3 <= data.length;) {
    if (data[offset] === 0 && data[offset + 1] === 0
      && data[offset + 2] === 0 && data[offset + 3] === 1) {
      result.push({ offset, length: 4 });
      offset += 4;
    } else if (data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 1) {
      result.push({ offset, length: 3 });
      offset += 3;
    } else {
      offset += 1;
    }
  }
  return result;
}
