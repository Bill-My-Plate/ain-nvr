import type { DecoderCommand } from '../../src/camera-runtime/types/decoder-command.type.js';
import type { DecoderMessage } from '../../src/camera-runtime/types/decoder-message.type.js';

const scenario = process.env.AIN_DECODER_TEST_SCENARIO ?? '';
let waitingForAck = false;

function send(message: DecoderMessage): void {
  process.send!(message);
}

process.on('message', (command: DecoderCommand) => {
  if (command.type === 'stop') {
    if (scenario !== 'cpu-stall' && scenario !== 'stop-during-retry') process.exit(0);
    return;
  }
  if (command.type === 'ack') {
    if (waitingForAck) process.kill(process.pid, 'SIGKILL');
    return;
  }
  const softwareOnly = command.softwareOnly;
  if (!softwareOnly && scenario === 'linker-error') process.exit(127);
  if (softwareOnly && scenario === 'cpu-error') process.exit(1);
  send({ type: 'ready' });
  if (softwareOnly && (scenario === 'cpu-stall' || scenario === 'stop-during-retry')) return;
  if (!softwareOnly && (scenario === 'reported-error' || scenario === 'cpu-error')) {
    send({ type: 'error', error: { message: 'Hardware decoder failed.' } });
    return;
  }
  waitingForAck = !softwareOnly && ['crash-after-frame', 'cpu-stall', 'stop-during-retry'].includes(scenario);
  send({
    type: 'frame',
    frame: {
      data: Buffer.from('jpeg'),
      frameNumber: 0,
      captureTimeMs: Date.now(),
      width: 320,
      height: 240,
      decoder: softwareOnly ? 'software' : 'vaapi',
    },
  });
});
