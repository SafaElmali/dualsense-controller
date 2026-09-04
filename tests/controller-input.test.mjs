import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerInput } from '../controller/input-state.js';

test('releasing a pointer preserves a button still held on the keyboard', () => {
  const input = new ControllerInput();
  input.setButton('cross', 'keyboard', 1);
  input.setButton('cross', 'pointer:1', 1);
  input.releaseSource('pointer:1');
  assert.equal(input.button('cross'), 1);
  input.releaseSource('keyboard');
  assert.equal(input.button('cross'), 0);
});

test('trigger returns to the other device pressure when a stronger input ends', () => {
  const input = new ControllerInput();
  input.setButton('r2', 'gamepad', .37);
  input.setButton('r2', 'pointer:2', 1);
  assert.equal(input.button('r2'), 1);
  input.releaseSource('pointer:2');
  assert.equal(input.button('r2'), .37);
});

test('stick travel stays circular and hands back to gamepad after dragging', () => {
  const input = new ControllerInput();
  input.setAxis('left', 'gamepad', .3, -.2);
  input.setAxis('left', 'pointer', 2, 2);
  assert.ok(Math.abs(Math.hypot(...Object.values(input.axis('left'))) - 1) < 1e-8);
  input.releaseAxis('left', 'pointer');
  assert.deepEqual(input.axis('left'), { x: .3, y: -.2 });
});

test('opposite keyboard keys center the stick while overriding a connected pad', () => {
  const input = new ControllerInput();
  input.setAxis('left', 'gamepad', .8, 0);
  input.setAxis('left', 'keyboard', 0, 0);
  assert.deepEqual(input.axis('left'), { x: 0, y: 0 });
});

test('focus loss clears buttons, triggers and both stick sources', () => {
  const input = new ControllerInput();
  input.setButton('r2', 'pointer:1', .8);
  input.setButton('cross', 'keyboard', 1);
  input.setAxis('left', 'pointer', .8, .8);
  input.setAxis('right', 'gamepad', -.4, 0);
  input.reset();
  assert.equal(input.button('r2'), 0);
  assert.equal(input.button('cross'), 0);
  assert.deepEqual(input.axis('left'), { x: 0, y: 0 });
  assert.deepEqual(input.axis('right'), { x: 0, y: 0 });
});
