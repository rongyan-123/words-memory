import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySwipe } from '../src/client/swipe.ts';
test('swipe needs 42px threshold and a clear horizontal majority', () => {
  assert.equal(classifySwipe({dx:41.99,dy:0}), null);
  assert.equal(classifySwipe({dx:42,dy:0}), 'right');
  assert.equal(classifySwipe({dx:-42,dy:0}), 'left');
  assert.equal(classifySwipe({dx:65,dy:50}), 'right');
  assert.equal(classifySwipe({dx:64.9,dy:50}), null);
});
test('vertical scroll, taps, bad coordinates and diagonals do not trigger actions', () => {
  for (const input of [{dx:0,dy:200},{dx:45,dy:120},{dx:-80,dy:-80},{dx:0,dy:0},{dx:NaN,dy:0},{dx:Infinity,dy:0}]) assert.equal(classifySwipe(input), null);
});
