import type { RecordingWriteRequest } from './recording-write-request.interface.js';
/**
 * Sink that writes ordered packets and returns their locations.
 */
export interface RecordingPacketWriter<TLocation> {
  /**
   * Writes one packet request and returns its opaque location in storage.
   */
  write(request: RecordingWriteRequest): Promise<TLocation>;
}
