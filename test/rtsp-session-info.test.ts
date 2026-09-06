import assert from 'node:assert/strict';
import test from 'node:test';

import { RtspClient, type RtspClientSession } from '../src/rtsp/client.js';
import { parseSdp } from '../src/rtsp/sdp.js';
import { RtspSessionManager, RtspStreamSession } from '../src/stream/rtsp-stream-session.js';
import { createBaselineSps, mediaPacket } from './helpers/media.js';
import { AinNvrError } from '../src/shared/ain-nvr-error.js';

class SessionInfoRtspClient extends RtspClient {
  constructor(private readonly result: RtspClientSession) {
    super({ url: 'rtsp://camera.example/stream' });
  }

  override async connect(): Promise<RtspClientSession> {
    return this.result;
  }

  override async close(): Promise<void> {
    this.emit('disconnect', new Error('Test client closed.'));
  }
}

function createSession(invalidParameterSets = false): RtspClientSession {
  const sps = invalidParameterSets ? 'AA==' : createBaselineSps().toString('base64');
  const pps = invalidParameterSets ? 'AA==' : Buffer.from([0x68, 0xaa]).toString('base64');
  const sdp = [
    'v=0',
    'm=video 0 RTP/AVP 96',
    'a=control:trackID=1',
    'a=rtpmap:96 H264/90000',
    `a=fmtp:96 packetization-mode=1;sprop-parameter-sets=${sps},${pps}`,
    'm=audio 0 RTP/AVP 0',
    'a=control:trackID=2',
    'a=rtpmap:0 PCMU/8000',
    'a=fmtp:0 channels=1',
    '',
  ].join('\r\n');
  const description = parseSdp(sdp);
  const videoMedia = description.media[0];
  const audioMedia = description.media[1];
  assert(videoMedia !== undefined);
  assert(audioMedia !== undefined);
  const videoRtpMap = videoMedia.rtpMaps.get(96);
  const audioRtpMap = audioMedia.rtpMaps.get(0);
  assert(videoRtpMap !== undefined);
  assert(audioRtpMap !== undefined);
  return {
    sdp,
    description,
    video: {
      media: videoMedia,
      rtpMap: videoRtpMap,
      controlUrl: 'rtsp://camera.example/trackID=1',
      rtpChannel: 4,
      rtcpChannel: 5,
    },
    audio: {
      codec: 'pcmu',
      media: audioMedia,
      rtpMap: audioRtpMap,
      controlUrl: 'rtsp://camera.example/trackID=2',
      rtpChannel: 8,
      rtcpChannel: 9,
    },
    sessionId: 'test-session',
  };
}

test('shared session exposes original SDP and negotiated track information', async () => {
  let clientCount = 0;
  const rtspSession = createSession();
  const manager = new RtspSessionManager({
    clientFactory: () => {
      clientCount += 1;
      return new SessionInfoRtspClient(rtspSession);
    },
  });

  const first = await manager.acquire({ url: 'rtsp://camera.example/stream' });
  const second = await manager.acquire({ url: 'rtsp://camera.example/stream' });
  assert.equal(clientCount, 1);
  assert.equal(first.session, second.session);
  assert.equal(first.session.sessionInfo.sdp, rtspSession.sdp);
  assert.deepEqual(first.session.sessionInfo.tracks.map((track) => ({
    trackId: track.trackId,
    control: track.control,
    fmtp: track.fmtp,
    rtpChannel: track.rtpChannel,
    rtcpChannel: track.rtcpChannel,
  })), [
    {
      trackId: 'video',
      control: 'trackID=1',
      fmtp: rtspSession.video.media.fmtp.get(96),
      rtpChannel: 4,
      rtcpChannel: 5,
    },
    {
      trackId: 'audio',
      control: 'trackID=2',
      fmtp: 'channels=1',
      rtpChannel: 8,
      rtcpChannel: 9,
    },
  ]);
  assert.equal(first.session.sessionInfo.tracks[0]?.parameterSets?.sps[0], 0x67);

  await first.release();
  assert.equal(manager.activeSessionCount, 1);
  await second.release();
  assert.equal(manager.activeSessionCount, 0);
});

test('invalid SDP parameter sets stay absent for in-band replacement', async () => {
  const manager = new RtspSessionManager({
    clientFactory: () => new SessionInfoRtspClient(createSession(true)),
  });
  const lease = await manager.acquire({ url: 'rtsp://camera.example/stream' });
  assert.equal(lease.session.sessionInfo.tracks[0]?.parameterSets, undefined);
  await lease.release();
});

class DeferredClient extends SessionInfoRtspClient {
  private resolveConnection!: (session: RtspClientSession) => void;
  private rejectConnection!: (error: Error) => void;
  readonly connection = new Promise<RtspClientSession>((resolve, reject) => {
    this.resolveConnection = resolve;
    this.rejectConnection = reject;
  });
  override connect(): Promise<RtspClientSession> { return this.connection; }
  ready(): void { this.resolveConnection(createSession()); }
  override async close(): Promise<void> {
    this.rejectConnection(new Error('Closed'));
    await super.close();
  }
}

class UnsupportedClient extends SessionInfoRtspClient {
  override async connect(): Promise<RtspClientSession> {
    throw new AinNvrError('unsupported_codec', 'No H.264 track');
  }
}

test('unsupported codec rejects acquisition with its terminal error code', async () => {
  const manager = new RtspSessionManager({ clientFactory: () => new UnsupportedClient(createSession()) });
  await assert.rejects(manager.acquire({ url: 'rtsp://camera.example/stream' }),
    (error: unknown) => error instanceof AinNvrError && error.code === 'unsupported_codec');
  assert.equal(manager.activeSessionCount, 0);
});

for (const cancelled of [0, 1]) {
  test(`cancelling pending consumer ${cancelled} leaves the other acquisition alive`, async () => {
    const client = new DeferredClient(createSession());
    const manager = new RtspSessionManager({ clientFactory: () => client });
    const controllers = [new AbortController(), new AbortController()];
    const pending = controllers.map((controller) => manager.acquire({
      url: 'rtsp://camera.example/stream', signal: controller.signal,
    }));
    const rejection = assert.rejects(pending[cancelled]!, /cancelled/);
    controllers[cancelled]!.abort(new Error('cancelled'));
    await rejection;
    assert.equal(manager.activeSessionCount, 1);
    client.ready();
    const lease = await pending[1 - cancelled]!;
    assert.equal(lease.session.state, 'streaming');
    await lease.release();
    await lease.release();
    assert.equal(manager.activeSessionCount, 0);
  });
}

test('shutdown rejects pending and future acquisitions', async () => {
  const client = new DeferredClient(createSession());
  const manager = new RtspSessionManager({ clientFactory: () => client });
  const pending = manager.acquire({ url: 'rtsp://camera.example/stream' });
  const rejected = assert.rejects(pending, /stopped/);
  await manager.stop();
  await rejected;
  await assert.rejects(manager.acquire({ url: 'rtsp://camera.example/stream' }), /stopped/);
  assert.equal(manager.activeSessionCount, 0);
});

test('cancellation racing readiness releases the final reference', async () => {
  const client = new DeferredClient(createSession());
  const manager = new RtspSessionManager({ clientFactory: () => client });
  const controller = new AbortController();
  const pending = manager.acquire({ url: 'rtsp://camera.example/stream', signal: controller.signal });
  client.ready();
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending, /cancelled/);
  assert.equal(manager.activeSessionCount, 0);
});

test('generation snapshot is delivered before buffered setup media and reconnect media', async () => {
  const clients: DeferredClient[] = [];
  const session = new RtspStreamSession({
    url: 'rtsp://camera.example/stream', reconnectInitialMs: 1,
    clientFactory: () => {
      const client = new DeferredClient(createSession());
      clients.push(client);
      return client;
    },
  });
  const order: string[] = [];
  session.subscribeSessionChanges((snapshot) => order.push(`session:${snapshot.generation}`));
  session.subscribeMediaPackets((packet) => order.push(`packet:${packet.sessionGeneration}`));
  const started = session.start();
  const frame = { ...mediaPacket(1, 90_000, Buffer.from([0x65, 1])).frame, channel: 4 };
  clients[0]!.emit('interleaved', frame);
  clients[0]!.ready();
  await started;
  clients[0]!.emit('disconnect', new Error('Reconnect'));
  const deadline = Date.now() + 1000;
  while (clients.length < 2 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.equal(clients.length, 2);
  const ready = new Promise<void>((resolve) => session.once('ready', resolve));
  clients[1]!.emit('interleaved', frame);
  clients[1]!.ready();
  await ready;
  assert.deepEqual(order, ['session:1', 'packet:1', 'session:2', 'packet:2']);
  assert.equal(session.snapshot?.generation, 2);
  await session.stop();
});
