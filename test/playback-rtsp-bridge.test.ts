import assert from 'node:assert/strict';
import net, { type Socket } from 'node:net';
import test from 'node:test';

import type { PlaybackMessage } from '../src/playback/playback-stream.js';
import { createH264CodecConfiguration } from '../src/rtp/h264-configuration.js';
import { parseRtpPacket } from '../src/rtp/packet.js';
import { PlaybackRtspBridge } from '../src/stream/playback-rtsp-bridge.js';
import { createBaselineSps } from './helpers/media.js';

class RtspTestClient {
  private buffered = Buffer.alloc(0);
  private change: (() => void) | undefined;

  constructor(readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffered = Buffer.concat([this.buffered, chunk]);
      this.change?.();
      this.change = undefined;
    });
  }

  async request(request: string): Promise<Buffer> {
    this.socket.write(request);
    while (true) {
      const headerEnd = this.buffered.indexOf('\r\n\r\n');
      if (headerEnd >= 0) {
        const header = this.buffered.subarray(0, headerEnd + 4);
        const lengthMatch = /content-length:\s*(\d+)/iu.exec(header.toString('ascii'));
        const bodyLength = Number(lengthMatch?.[1] ?? 0);
        const responseLength = headerEnd + 4 + bodyLength;
        if (this.buffered.length >= responseLength) {
          const response = this.buffered.subarray(0, responseLength);
          this.buffered = this.buffered.subarray(responseLength);
          return response;
        }
      }
      await this.waitForData();
    }
  }

  async readInterleavedFrame(): Promise<Buffer> {
    while (true) {
      if (this.buffered.length >= 4 && this.buffered[0] === 0x24) {
        const length = this.buffered.readUInt16BE(2);
        if (this.buffered.length >= length + 4) {
          const frame = this.buffered.subarray(0, length + 4);
          this.buffered = this.buffered.subarray(length + 4);
          return frame;
        }
      }
      await this.waitForData();
    }
  }

  private async waitForData(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for RTSP data.')),
        2_000,
      );
      const closed = (): void => {
        clearTimeout(timeout);
        reject(new Error('RTSP test client closed.'));
      };
      this.change = () => {
        clearTimeout(timeout);
        this.socket.off('close', closed);
        resolve();
      };
      this.socket.once('close', closed);
    });
  }
}

const configuration = createH264CodecConfiguration(
  createBaselineSps(640, 352),
  Buffer.from([0x68, 0xaa]),
);

function request(method: string, uri: string, cseq: number, headers = ''): string {
  return `${method} ${uri} RTSP/1.0\r\nCSeq: ${cseq}\r\n${headers}\r\n`;
}

async function* playbackMessages(): AsyncGenerator<PlaybackMessage> {
  yield {
    kind: 'ready',
    requestedTimeMs: 1_050,
    actualStartTimeMs: 1_000,
    configuration,
  };
  yield {
    kind: 'video',
    type: 'key',
    data: Buffer.from([0, 0, 0, 1, 0x65, 1, 2]),
    rtpTimestamp: 90_000,
    timestampUs: 0,
    wallClockTimeMs: 1_000,
    discontinuity: false,
    configuration,
  };
  yield {
    kind: 'audio',
    data: Buffer.from([0x34, 0x12]),
    timestampUs: 10_000,
    wallClockTimeMs: 1_010,
    durationUs: 125,
    sampleFormat: 's16le',
    sampleRate: 8_000,
    channels: 1,
  };
  yield {
    kind: 'video',
    type: 'delta',
    data: Buffer.from([0, 0, 0, 1, 0x41, 3, 4]),
    rtpTimestamp: 99_000,
    timestampUs: 100_000,
    wallClockTimeMs: 1_100,
    discontinuity: false,
  };
  yield { kind: 'end', reason: 'end-of-recording' };
}

test('playback bridge serves token-scoped H.264 and L16 until the selected end', async () => {
  const bridge = new PlaybackRtspBridge({
    playback: playbackMessages(),
    endTimeMs: 1_100,
    audioSampleRate: 8_000,
  });
  let socket: Socket | undefined;
  try {
    const started = await bridge.start();
    assert.equal(started.requestedStartTimeMs, 1_050);
    assert.equal(started.actualStartTimeMs, 1_000);
    const parsedUrl = new URL(started.url);
    socket = net.connect(Number(parsedUrl.port), parsedUrl.hostname);
    await new Promise<void>((resolve, reject) => {
      socket?.once('connect', resolve);
      socket?.once('error', reject);
    });
    const client = new RtspTestClient(socket);

    const rejected = await client.request(
      request('DESCRIBE', `${parsedUrl.protocol}//${parsedUrl.host}/wrong-token`, 1),
    );
    assert.match(rejected.toString('ascii'), /RTSP\/1\.0 404 Not Found/u);
    const describe = await client.request(request('DESCRIBE', started.url, 2));
    assert.match(describe.toString('utf8'), /a=rtpmap:96 H264\/90000/u);
    assert.match(describe.toString('utf8'), /a=rtpmap:97 L16\/8000\/1/u);
    const videoSetup = await client.request(
      request(
        'SETUP',
        `${started.url}/trackID=0`,
        3,
        'Transport: RTP/AVP/TCP;unicast;interleaved=4-5\r\n',
      ),
    );
    assert.match(videoSetup.toString('ascii'), /interleaved=4-5/u);
    const audioSetup = await client.request(
      request(
        'SETUP',
        `${started.url}/trackID=1`,
        4,
        'Transport: RTP/AVP/TCP;unicast;interleaved=6-7\r\n',
      ),
    );
    assert.match(audioSetup.toString('ascii'), /interleaved=6-7/u);

    const running = bridge.run();
    const play = await client.request(request('PLAY', started.url, 5));
    const videoFrame = await client.readInterleavedFrame();
    const audioFrame = await client.readInterleavedFrame();
    await running;

    assert.equal(videoFrame[1], 4);
    assert.deepEqual(parseRtpPacket(videoFrame.subarray(4)).payload, Buffer.from([0x65, 1, 2]));
    assert.equal(audioFrame[1], 6);
    assert.deepEqual(parseRtpPacket(audioFrame.subarray(4)).payload, Buffer.from([0x12, 0x34]));
    const rtpInfo = /RTP-Info: ([^\r\n]+)/u.exec(play.toString('ascii'))?.[1];
    assert.ok(rtpInfo, 'PLAY must map both RTP clocks to npt=0');
    for (const [track, frame, offset] of [
      [0, videoFrame, 0],
      [1, audioFrame, 80],
    ] as const) {
      const entry: string | undefined = rtpInfo
        .split(',')
        .find((value) => value.startsWith('url=' + started.url + '/trackID=' + track + ';'));
      assert.ok(entry);
      const sequence: number = Number(/seq=(\d+)/u.exec(entry)?.[1]);
      const origin: number = Number(/rtptime=(\d+)/u.exec(entry)?.[1]);
      const packet = parseRtpPacket(frame.subarray(4));
      assert.equal(packet.sequenceNumber, sequence);
      assert.equal((packet.timestamp - origin) >>> 0, offset);
    }
  } finally {
    socket?.destroy();
    await bridge.stop();
  }
});

test('playback bridge rejects packets beyond its client queue bound', async () => {
  const bridge = new PlaybackRtspBridge({
    playback: playbackMessages(),
    maximumQueuedBytes: 4,
  });
  let socket: Socket | undefined;
  try {
    const started = await bridge.start();
    const parsedUrl = new URL(started.url);
    socket = net.connect(Number(parsedUrl.port), parsedUrl.hostname);
    await new Promise<void>((resolve, reject) => {
      socket?.once('connect', resolve);
      socket?.once('error', reject);
    });
    const client = new RtspTestClient(socket);
    await client.request(
      request(
        'SETUP',
        `${started.url}/trackID=0`,
        1,
        'Transport: RTP/AVP/TCP;unicast;interleaved=0-1\r\n',
      ),
    );
    const rejected = assert.rejects(bridge.run(), /media queue limit/u);
    await client.request(request('PLAY', started.url, 2));
    await rejected;
  } finally {
    socket?.destroy();
    await bridge.stop();
  }
});
