import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioQueue } from '../packages/sequencing/audio-queue.js';

test('solo phrases allocate only imminent voices, in chronological order', () => {
  const queue = new AudioQueue();
  const heard: number[] = [];
  for (let i = 999; i >= 0; i--) queue.add(i * .125, () => heard.push(i));
  queue.flush(0);
  assert.deepEqual(heard, [0, 1]);
  assert.equal(queue.size, 998);
  for (let i = 1; i < 5000; i++) queue.flush(i * .025);
  assert.deepEqual(heard, Array.from({length:1000}, (_, i) => i));
});

test('suspension holds future notes; stop cancels them; late notes never burst', () => {
  const queue = new AudioQueue();
  const heard: number[] = [];
  for (let i = 0; i < 20; i++) queue.add(i, () => heard.push(i));
  queue.flush(0);
  for (let i = 0; i < 100; i++) queue.flush(0);
  assert.deepEqual(heard, [0]);
  queue.flush(10);
  assert.deepEqual(heard, [0, 10]);
  queue.clear();
  queue.flush(19);
  assert.equal(queue.size, 0);
  assert.deepEqual(heard, [0, 10]);
  queue.add(20, delay => assert.ok(Math.abs(delay - .1) < 1e-9));
  queue.flush(19.9);
});
