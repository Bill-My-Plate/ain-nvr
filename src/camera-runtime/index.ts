export type {
  CommittedSegment,
  CameraLease,
  CameraStatus,
  FrameHandle,
  FrameOptions,
  RecordingHandle,
  RecordingOptions,
} from '../camera/index.js';
export type { CameraRuntimeOptions } from './types/camera-runtime-options.interface.js';
export type { CameraRuntime } from './types/camera-runtime.interface.js';
export { getCameraRuntime } from './utils/get-camera-runtime.util.js';
