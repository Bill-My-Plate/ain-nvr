
import { resolveSettings } from './resolve-settings.util.js';

import { failure } from './failure.util.js';
import { type RuntimeSettings } from '../types/runtime-settings.type.js';
import type { CameraRuntime } from '../types/camera-runtime.interface.js';
import type { CameraRuntimeOptions } from '../types/camera-runtime-options.interface.js';

import { ManagedCameraRuntime } from '../services/managed-camera-runtime.class.js';
import { registryKey } from '../constants/registry-key.constant.js';
import { ABI } from '../constants/abi.constant.js';
import type { Registry } from '../types/registry.type.js';

/**
 * Shared by ESM/CommonJS imports in this JavaScript context. No work starts until acquire().
 * One worker owns each camera's RTSP session and schema-1 cache recording. Native JPEG
 * extraction runs in a package-owned child process fed by that worker's loopback bridge.
 * Other processes, go2rtc and direct low-level APIs are outside this registry.
 * Worker and decoder entrypoints are resolved relative to the installed package.
 */
export function getCameraRuntime(options: CameraRuntimeOptions = {}): CameraRuntime {
  const scope = globalThis as typeof globalThis & { [registryKey]?: Registry };
  const existing = scope[registryKey];
  if (existing !== undefined) {
    if (existing.abi !== ABI) throw failure('EPROTO', 'Incompatible ain-nvr camera runtime is already loaded.');
    if (!existing.runtime.finished) {
      if (existing.runtime.closed) throw failure('ECLOSED', 'Wait for camera runtime close() before creating another runtime.');
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined && existing.runtime.settings[key as keyof RuntimeSettings] !== value) {
          throw failure('EINVAL', `Camera runtime is already configured with a different ${key}.`);
        }
      }
      return existing.runtime;
    }
  }
  const runtime = new ManagedCameraRuntime(resolveSettings(options));
  scope[registryKey] = { abi: ABI, runtime };
  return runtime;
}
