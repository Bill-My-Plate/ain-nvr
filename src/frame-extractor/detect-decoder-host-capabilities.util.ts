import { cpus } from 'node:os';
import { readdirSync } from 'node:fs';



import type { DecoderHostCapabilities } from './decoder-host-capabilities.interface.js';

export function detectDecoderHostCapabilities(
  environment: NodeJS.ProcessEnv = process.env,
): DecoderHostCapabilities {
  let renderDevices: string[] = [];
  if (process.platform === 'linux') {
    try {
      renderDevices = readdirSync('/dev/dri')
        .filter((entry) => entry.startsWith('renderD'))
        .map((entry) => `/dev/dri/${entry}`);
    } catch {
      renderDevices = [];
    }
  }

  return {
    platform: process.platform,
    arch: process.arch,
    renderDevices,
    cudaAvailable: (
      process.platform === 'linux'
      && Boolean(environment.NVIDIA_VISIBLE_DEVICES)
      && Boolean(environment.NVIDIA_DRIVER_CAPABILITIES)
    ) || (
      process.platform === 'win32'
      && Boolean(environment.CUDA_PATH)
    ),
    intelCpu: process.platform === 'win32'
      && cpus().some((cpu) => cpu.model.includes('Intel')),
  };
}
