import type { ClientState } from '../types/client-state.type.js';
import { interleavedFrame } from './playback-rtsp-server-interleaved-frame.util.js';

/**
 * Frames and sends one RTP packet through a negotiated RTSP interleaved
 * channel. Waits for socket drain when backpressure starts and removes every
 * temporary listener when the write settles.
 * @param packet One complete variable-length RTP packet. Its first 12 bytes
 * are the fixed RTP header; the remaining bytes are media payload. This
 * function adds the four-byte RTSP interleaved prefix.
 */
export async function sendPlaybackRtspPacket(
  client: ClientState | undefined,
  track: 0 | 1,
  packet: Buffer,
  maximumQueuedBytes: number,
): Promise<void> {
  const channel = client?.channels.get(track)?.rtp;
  if (
    client === undefined ||
    channel === undefined ||
    !client.playing ||
    client.socket.destroyed
  ) {
    throw new Error('Playback RTSP client is not ready for media.');
  }
  const frame = interleavedFrame(channel, packet);
  if (client.socket.writableLength + frame.length > maximumQueuedBytes) {
    throw new Error('Playback RTSP client exceeded its media queue limit.');
  }
  if (client.socket.write(frame)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      client.socket.off('drain', onDrain);
      client.socket.off('error', onError);
      client.socket.off('close', onClose);
    };
    const onDrain = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error('Playback RTSP client closed during playback.'));
    };
    client.socket.once('drain', onDrain);
    client.socket.once('error', onError);
    client.socket.once('close', onClose);
  });
}
