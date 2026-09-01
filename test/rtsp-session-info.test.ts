import assert from 'node:assert/strict';
import test from 'node:test';

import { RtspClient, type RtspClientSession } from '../src/rtsp/client.js';
import { parseSdp } from '../src/rtsp/sdp.js';
import { RtspSessionManager } from '../src/stream/rtsp-stream-session.js';
import { createBaselineSps } from './helpers/media.js';

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
