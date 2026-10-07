import type { CameraRuntimeOptions } from './camera-runtime-options.interface.js';
import type { RuntimeSettings } from './runtime-settings.type.js';

import { defaults } from './defaults.constant.js';

export function resolveSettings(options: CameraRuntimeOptions): RuntimeSettings {
  const settings = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof RuntimeSettings)[]) {
    const value = options[key] ?? defaults[key];
    if (!Number.isSafeInteger(value) || value < (key === 'maxWorkerRestarts' ? 0 : 1)) {
      throw new RangeError(`${key} must be a ${key === 'maxWorkerRestarts' ? 'nonnegative' : 'positive'} safe integer.`);
    }
    settings[key] = value;
  }
  return settings;
}
