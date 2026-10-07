








import type { RecordingWriteRequest } from './recording-write-request.interface.js';

export interface RecordingPacketWriter<TLocation> {
  write(request: RecordingWriteRequest): Promise<TLocation>;
}
