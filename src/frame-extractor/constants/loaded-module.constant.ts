import type { LibavModule } from '../types/libav-module.type.js';

export const loadedModule: {
  /** Stored resource or pending value. */
  value?: LibavModule;
} = {};
