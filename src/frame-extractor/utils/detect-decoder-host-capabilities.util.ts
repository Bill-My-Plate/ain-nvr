import { cpus } from 'node:os';
import { accessSync, constants, readdirSync } from 'node:fs';

import type { DecoderHostCapabilities } from '../types/decoder-host-capabilities.interface.js';
/**
 * Reads host and device capabilities used for decoder selection.
 */
export function detectDecoderHostCapabilities(
  environment: NodeJS.ProcessEnv = process.env,
): DecoderHostCapabilities {
  let renderDevices: string[] = [];
  if (process.platform === 'linux') {
    try {
      renderDevices = readdirSync('/dev/dri')
        .filter((entry) => entry.startsWith('renderD'))
        .map((entry) => `/dev/dri/${entry}`)
        .filter((device) => {
          try {
            accessSync(device, constants.R_OK | constants.W_OK);
            return true;
          } catch {
            return false;
          }
        });
    } catch {
      renderDevices = [];
    }
  }

  return {
    platform: process.platform,
    arch: process.arch,
    renderDevices,
    cudaAvailable:
      (process.platform === 'linux' &&
        Boolean(environment.NVIDIA_VISIBLE_DEVICES) &&
        Boolean(environment.NVIDIA_DRIVER_CAPABILITIES)) ||
      (process.platform === 'win32' && Boolean(environment.CUDA_PATH)),
    intelCpu: process.platform === 'win32' && cpus().some((cpu) => cpu.model.includes('Intel')),
  };
}
