



import { AinNvrError } from '../../shared/index.js';

export class RecordedStreamError extends AinNvrError {
  override readonly name = 'RecordedStreamError';

  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super('corrupt_media', message, options);
  }
}
