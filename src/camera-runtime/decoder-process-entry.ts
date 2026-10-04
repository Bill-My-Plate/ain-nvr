import { RtspUrlFrameExtractor } from '../frame-extractor/rtsp-url-frame-extractor.js';
import { createScryptedLibavRuntime } from '../frame-extractor/scrypted-libav-runtime.js';
import { deferred, serializeError } from './protocol.js';
import type { DecoderCommand, DecoderMessage } from './decoder-protocol.js';

// @scrypted/libav 1.0.212 uses cross-isolate native state: concurrent thread
// decoders can abort V8. Keep the addon in a separate process, even for one camera.
if (process.send === undefined) throw new Error('Decoder entry requires a private IPC channel.');
let extractor: RtspUrlFrameExtractor | undefined;
let pending: ReturnType<typeof deferred<void>> | undefined;
let starting = false;
let stopping = false;
let errors = 0;
const send = (message: DecoderMessage): void => {
  if (process.connected) process.send?.(message, error => { if (error) process.exit(1); });
};
process.on('disconnect', () => process.exit(0));
process.on('message', (command: DecoderCommand) => {
  if (command.type === 'ack') { pending?.resolve(); pending = undefined; return; }
  if (command.type === 'stop') {
    stopping = true;
    pending?.resolve();
    void extractor?.stop().finally(() => process.exit(0));
    if (extractor === undefined) process.exit(0);
    return;
  }
  if (command.type !== 'start' || starting) return;
  starting = true;
  void (async () => {
    if (!command.url.startsWith('rtsp://127.0.0.1:')) throw new Error('Decoder requires the private loopback bridge.');
    const runtime = createScryptedLibavRuntime({ install: false });
    await runtime.initialize();
    if (stopping) return;
    extractor = new RtspUrlFrameExtractor({
      id: command.cameraId, url: command.url, runtime, ...command.profile,
      onFrame: async frame => {
        if (stopping) return;
        if (frame.data.length > command.maximumFrameBytes) throw new Error('JPEG exceeds maximumFrameBytes.');
        errors = 0;
        pending = deferred<void>();
        send({ type: 'frame', frame });
        await pending.promise;
      },
      onError: error => {
        if (stopping) return;
        // The extractor retries its local decoder; upstream retry stays in the camera worker.
        if (++errors >= 3) {
          send({ type: 'error', error: serializeError(error) });
          process.exitCode = 1;
          void extractor?.stop().finally(() => process.exit(1));
        }
      },
    });
    extractor.start();
    send({ type: 'ready' });
  })().catch(error => {
    send({ type: 'error', error: serializeError(error) });
    process.exitCode = 1;
    process.disconnect?.();
  });
});
