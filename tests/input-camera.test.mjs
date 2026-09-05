import test from 'node:test';
import assert from 'node:assert/strict';
import { InputCamera } from '../controller/input-camera.js';
import { ControllerInput } from '../controller/input-state.js';

function setup() {
  const angles = [];
  const camera = new InputCamera(angle => angles.push(angle));
  const input = new ControllerInput(event => camera.observe(event));
  return { camera, input, angles };
}

test('trigger presses reveal the rear, stay there after release, and face buttons return to front', () => {
  const { input, angles } = setup();
  input.setButton('r2', 'gamepad', .3);
  input.setButton('r2', 'gamepad', .8);
  input.setButton('r2', 'gamepad', 0);
  assert.deepEqual(angles, ['triggers']);
  input.setButton('cross', 'keyboard', 1);
  assert.deepEqual(angles, ['triggers', 'front']);
  input.setButton('r1', 'gamepad', 1);
  assert.equal(angles.at(-1), 'shoulders');
});

test('both triggers take priority over sticks and face buttons until released', () => {
  const { input, angles } = setup();
  input.setButton('l2', 'gamepad', .5);
  input.setAxis('left', 'gamepad', .7, 0);
  input.setButton('r2', 'gamepad', 1);
  input.setButton('cross', 'gamepad', 1);
  input.setButton('r2', 'gamepad', 0);
  assert.deepEqual(angles, ['triggers']);
  input.setButton('l2', 'gamepad', 0);
  assert.deepEqual(angles, ['triggers', 'front']);
});

test('small analog noise does not start a camera turn', () => {
  const { input, angles } = setup();
  input.setButton('r2', 'gamepad', .06);
  input.setAxis('left', 'gamepad', .1, 0);
  assert.deepEqual(angles, []);
  input.setButton('r2', 'gamepad', .2);
  input.setButton('r2', 'gamepad', .08);
  input.setButton('cross', 'keyboard', 1);
  assert.deepEqual(angles, ['triggers']);
  input.setButton('r2', 'gamepad', 0);
  assert.deepEqual(angles, ['triggers', 'front']);
});

test('manual angles pause following; resuming and Reset restore the expected angle', () => {
  const { camera, input, angles } = setup();
  camera.setEnabled(false);
  input.setButton('r2', 'gamepad', 1);
  assert.deepEqual(angles, []);
  camera.setEnabled(true);
  assert.deepEqual(angles, ['triggers']);
  input.reset(); camera.reset();
  assert.equal(camera.enabled, true);
  assert.equal(camera.view, 'front');
  assert.equal(camera.held.size, 0);
  assert.equal(angles.at(-1), 'front');
});
