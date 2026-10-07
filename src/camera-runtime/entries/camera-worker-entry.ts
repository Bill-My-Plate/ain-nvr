import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { CameraEngine } from '../services/camera-engine.class.js';
import { PROTOCOL_VERSION } from '../constants/protocol-version.constant.js';
import { serializeError } from '../utils/serialize-error.util.js';
import { terminalCameraError } from '../utils/terminal-camera-error.util.js';
import { type HostMessage } from '../types/host-message.type.js';
import { type RuntimeSettings } from '../types/runtime-settings.type.js';

function startCameraWorkerEntry(): void {
  if (parentPort === null) throw new Error('Camera worker requires a parent port.');
  const port = parentPort;
  const { cameraId, url, epoch, settings, framePort } = workerData as {
    cameraId: string; url: string; epoch: number; settings: RuntimeSettings; framePort: MessagePort;
  };
  const engine = new CameraEngine(cameraId, url, epoch, settings, framePort, message => port.postMessage(message));
  let queue = Promise.resolve();
  let queued = 0;
  port.on('message', (message: HostMessage) => {
    if (message.epoch !== epoch) return;
    if (message.kind === 'event-ack') { engine.acknowledgeEvent(message.sequence, message.failed); return; }
    if (message.kind === 'status-ack') { engine.acknowledgeStatus(); return; }
    if (message.kind !== 'request') return;
    if (++queued > 64) {
      queued--;
      port.postMessage({ kind: 'response', epoch, id: message.id, error: { message: 'Camera command queue is full.', code: 'EBUSY' } });
      return;
    }
    // Close cancels negotiation immediately; its response still follows previous commands.
    if (message.command.type === 'close') void engine.close().catch(() => undefined);
    queue = queue.then(async () => {
      try {
        await engine.execute(message.command);
        port.postMessage({ kind: 'response', epoch, id: message.id });
      } catch (error) {
        port.postMessage({ kind: 'response', epoch, id: message.id, error: serializeError(error) });
      } finally {
        queued--;
        if (message.command.type === 'close') port.close();
      }
    });
  });
  void engine.start().then(() => {
    port.postMessage({ kind: 'ready', epoch, version: PROTOCOL_VERSION, generation: engine.streamGeneration });
  }).catch(error => {
    port.postMessage({ kind: 'fatal', epoch, error: serializeError(error), terminal: terminalCameraError(error) });
    void engine.close().finally(() => port.close()).catch(() => undefined);
  });
}

startCameraWorkerEntry();
