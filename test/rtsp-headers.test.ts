import assert from 'node:assert/strict';
import test from 'node:test';

import { RtspHeaders, RtspParser } from '../src/rtsp-parser/index.js';

test('RtspHeaders stores and looks up names without regard to case', () => {
  const headers = new RtspHeaders();
  headers.set('Content-Length', '4');
  assert.equal(headers.get('CONTENT-LENGTH'), '4');
  assert.equal(headers.get('content-length'), '4');
  assert.equal(headers.has('CoNtEnT-LeNgTh'), true);
  assert.deepEqual([...headers], [['content-length', '4']]);
  assert.equal(headers.delete('CONTENT-LENGTH'), true);
  assert.equal(headers.has('content-length'), false);
});

test('RTSP parser uses case-insensitive headers and merges duplicate names', () => {
  const parser = new RtspParser({ mode: 'message' });
  const [message] = parser.push(Buffer.from(
    'RTSP/1.0 200 OK\r\nContent-Length: 4\r\nX-Trace: one\r\nx-trace: two\r\n\r\ntest',
  ));
  assert.ok(message);
  if (message.type !== 'rtsp-message') throw new Error('Expected an RTSP message.');
  assert.ok(message.headers instanceof RtspHeaders);
  assert.equal(message.body.toString(), 'test');
  assert.equal(message.headers.get('CONTENT-LENGTH'), '4');
  assert.equal(message.headers.get('X-TRACE'), 'one, two');
  assert.deepEqual([...message.headers.keys()], ['content-length', 'x-trace']);
});
