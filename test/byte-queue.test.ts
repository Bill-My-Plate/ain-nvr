import assert from 'node:assert/strict';
import test from 'node:test';

import { ByteQueue } from '../src/rtsp-parser/services/byte-queue.class.js';

test('ByteQueue.peek does not expose bytes held in one chunk', () => {
  const queue = new ByteQueue();
  const input = Buffer.from([1, 2, 3]);
  queue.push(input);
  queue.discard(1);

  const peeked = queue.peek(2);
  peeked[0] = 99;

  assert.deepEqual(input, Buffer.from([1, 2, 3]));
  assert.deepEqual(queue.read(2), Buffer.from([2, 3]));
});

test('ByteQueue.peek isolates bytes across chunks and returns a fresh empty buffer', () => {
  const queue = new ByteQueue();
  queue.push(Buffer.from([4]));
  queue.push(Buffer.from([5]));

  const peeked = queue.peek(2);
  peeked[1] = 99;

  assert.deepEqual(queue.read(2), Buffer.from([4, 5]));
  assert.notStrictEqual(queue.peek(0), queue.peek(0));
});

test('ByteQueue.indexOf finds overlapping sequences across chunk boundaries', () => {
  const queue = new ByteQueue();
  queue.push(Buffer.from('xaba'));
  queue.push(Buffer.from('bab'));
  queue.push(Buffer.from('ac'));
  queue.discard(1);

  const sequence = Buffer.from('ababac');
  assert.equal(queue.indexOf(sequence, 7), -1);
  assert.equal(queue.indexOf(sequence, 8), 2);
  assert.equal(queue.indexOf(Buffer.from('absent')), -1);
  assert.equal(queue.indexOf(Buffer.alloc(0)), 0);
});

test('ByteQueue.indexOf respects head offset and search limit in one chunk', () => {
  const queue = new ByteQueue();
  queue.push(Buffer.from('xxhelloZZ'));
  queue.discard(2);

  assert.equal(queue.indexOf(Buffer.from('lo'), 4), -1);
  assert.equal(queue.indexOf(Buffer.from('lo'), 5), 3);
});

test('ByteQueue.indexOf handles many tiny chunks with a repeated prefix', () => {
  const queue = new ByteQueue();
  for (let index = 0; index < 256; index += 1) {
    queue.push(Buffer.from('a'));
  }
  queue.push(Buffer.from('b'));

  assert.equal(queue.indexOf(Buffer.from('aaaaab'), 256), -1);
  assert.equal(queue.indexOf(Buffer.from('aaaaab')), 251);
});
