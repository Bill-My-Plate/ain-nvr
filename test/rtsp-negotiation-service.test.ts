import assert from 'node:assert/strict';
import test from 'node:test';

import { RtspHeaders, type RtspMessage } from '../src/rtsp-parser/index.js';
import { RtspNegotiationService } from '../src/rtsp-client/services/rtsp-negotiation-service.class.js';
import type { RtspRequestService } from '../src/rtsp-client/services/rtsp-request-service.class.js';
import type { RequestOptions } from '../src/rtsp-client/types/request-options.type.js';

const url = 'rtsp://camera.example/live';
const sdp = [
  'v=0',
  'm=video 0 RTP/AVP 96',
  'a=control:trackID=1',
  'a=rtpmap:96 H264/90000',
  'm=audio 0 RTP/AVP 0',
  'a=control:trackID=2',
  'a=rtpmap:0 PCMU/8000',
  '',
].join('\r\n');

function response(headers: Record<string, string> = {}, body = ''): RtspMessage {
  const parsedHeaders = new RtspHeaders();
  for (const [name, value] of Object.entries(headers)) parsedHeaders.set(name, value);
  return {
    type: 'rtsp-message',
    startLine: { type: 'response', version: 'RTSP/1.0', statusCode: 200, statusMessage: 'OK' },
    headers: parsedHeaders,
    body: Buffer.from(body),
    rawHeader: Buffer.alloc(0),
  };
}

test('negotiation preserves method order, track URLs, and session headers', async () => {
  const calls: Array<{ method: string; uri: string; options: RequestOptions }> = [];
  let negotiation: RtspNegotiationService;
  const replies = [
    response({ Public: 'OPTIONS, DESCRIBE, SETUP, PLAY, GET_PARAMETER' }),
    response({ 'Content-Base': 'rtsp://camera.example/live/' }, sdp),
    response({ Session: 'camera-session;timeout=30', Transport: 'RTP/AVP/TCP;unicast;interleaved=4-5' }),
    response({ Transport: 'RTP/AVP/TCP;unicast;interleaved=6-7' }),
    response(),
  ];
  const requests = {
    async request(method: string, uri: string, options: RequestOptions = {}): Promise<RtspMessage> {
      calls.push({ method, uri, options });
      if (method === 'PLAY') assert.equal(negotiation.sessionId, 'camera-session');
      const next = replies.shift();
      if (next === undefined) throw new Error('Unexpected RTSP request.');
      return next;
    },
  } as unknown as RtspRequestService;
  negotiation = new RtspNegotiationService(url, requests);

  const { session, optionsResponse } = await negotiation.negotiate();
  assert.deepEqual(calls.map(({ method }) => method), ['OPTIONS', 'DESCRIBE', 'SETUP', 'SETUP', 'PLAY']);
  assert.equal(calls[2]?.uri, 'rtsp://camera.example/live/trackID=1');
  assert.equal(calls[3]?.uri, 'rtsp://camera.example/live/trackID=2');
  assert.deepEqual(calls[3]?.options.headers, {
    Session: 'camera-session',
    Transport: 'RTP/AVP/TCP;unicast;interleaved=2-3',
  });
  assert.deepEqual(calls[4]?.options.headers, { Session: 'camera-session', Range: 'npt=0.000-' });
  assert.equal(optionsResponse.headers.get('public'), 'OPTIONS, DESCRIBE, SETUP, PLAY, GET_PARAMETER');
  assert.equal(session.video.rtpChannel, 4);
  assert.equal(session.audio?.rtpChannel, 6);
  assert.equal(session.sessionId, 'camera-session');
  assert.equal(session.sessionTimeoutSeconds, 30);
  assert.equal(session.sdp, sdp);
});

test('optional audio SETUP failure still permits video PLAY', async () => {
  const methods: string[] = [];
  const replies = [
    response(),
    response({}, sdp),
    response({ Session: 'video-only', Transport: 'RTP/AVP/TCP;unicast;interleaved=0-1' }),
  ];
  const requests = {
    async request(method: string): Promise<RtspMessage> {
      methods.push(method);
      if (method === 'SETUP' && methods.filter((value) => value === 'SETUP').length === 2) {
        throw new Error('Audio unavailable.');
      }
      if (method === 'PLAY') return response();
      const next = replies.shift();
      if (next === undefined) throw new Error('Unexpected RTSP request.');
      return next;
    },
  } as unknown as RtspRequestService;

  const negotiation = new RtspNegotiationService(url, requests);
  const { session } = await negotiation.negotiate();
  assert.deepEqual(methods, ['OPTIONS', 'DESCRIBE', 'SETUP', 'SETUP', 'PLAY']);
  assert.equal(session.audio, undefined);
  assert.equal(session.video.rtpChannel, 0);
});
