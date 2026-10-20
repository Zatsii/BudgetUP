import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fitLongEdge } from '../utils/imageSize.ts';

test('scales the long edge down to 1600, keeping aspect ratio', () => {
  assert.deepEqual(fitLongEdge(4032, 3024), { width: 1600, height: 1200, scaled: true }); // iPhone landscape
  assert.deepEqual(fitLongEdge(3024, 4032), { width: 1200, height: 1600, scaled: true }); // portrait
  assert.deepEqual(fitLongEdge(4000, 4000), { width: 1600, height: 1600, scaled: true });
  assert.deepEqual(fitLongEdge(1080, 2400), { width: 720, height: 1600, scaled: true });
});

test('never upscales small images', () => {
  assert.deepEqual(fitLongEdge(1600, 900), { width: 1600, height: 900, scaled: false });
  assert.deepEqual(fitLongEdge(640, 480), { width: 640, height: 480, scaled: false });
});

test('unknown dimensions are left alone', () => {
  assert.equal(fitLongEdge(0, 0).scaled, false);
  assert.equal(fitLongEdge(Number.NaN, 100).scaled, false);
});
