


import type { CameraLease } from './camera-lease.interface.js';

export interface CameraRuntime {
  acquire(input: { cameraId: string; url: string; signal?: AbortSignal }): Promise<CameraLease>;
  close(): Promise<void>;
}
