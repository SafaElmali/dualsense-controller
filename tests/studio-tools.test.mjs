import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveTriggers } from '../controller/adaptive-triggers.js';
import { TouchDrawing } from '../controller/touch-drawing.js';
import { ControllerDiagnostics } from '../controller/controller-diagnostics.js';
import { TargetPractice } from '../controller/target-practice.js';

const contact = (id, x, y = .5) => ({ id, x, y });
test('two fingers draw independent trails; lifting, changing colors and losing focus break strokes', () => {
  const drawing = new TouchDrawing();
  drawing.contacts('hardware', [contact(1, .1), contact(2, .8)]);
  drawing.contacts('hardware', [contact(1, .2), contact(2, .7)]);
  assert.deepEqual(drawing.strokes.map(s => s.points.length), [2, 2]);
  drawing.contacts('hardware', [contact(2, .6)]);
  drawing.contacts('hardware', [contact(1, .3), contact(2, .5)]);
  assert.equal(drawing.strokes.length, 3);
  drawing.contacts('hardware', [contact(1, .4)], '#83c7ff');
  assert.equal(drawing.strokes.length, 4);
  drawing.end('hardware'); drawing.contacts('hardware', [contact(1, .5)], '#83c7ff');
  assert.equal(drawing.strokes.length, 5);
});
test('pointer and hardware strokes coexist; invalid points are ignored, coordinates bounded and clear starts over', () => {
  const drawing = new TouchDrawing();
  drawing.contacts('hardware', [contact(1, -.5, 2), contact(2, NaN)]);
  drawing.contacts('pointer', [contact(1, .5)]);
  drawing.contacts('hardware', []);
  drawing.contacts('pointer', [contact(1, .7)]);
  assert.deepEqual(drawing.strokes[0].points, [{ x: 0, y: 1 }]);
  assert.equal(drawing.strokes[1].points.length, 2);
  drawing.clear(); assert.equal(drawing.strokes.length, 0); assert.equal(drawing.pointCount, 0); assert.equal(drawing.active.size, 0);
});
test('stationary fingers do not accumulate points and long drawings have a bounded memory budget', () => {
  const drawing = new TouchDrawing();
  for (let i = 0; i < 100; i++) drawing.contacts('hardware', [contact(1, .5)]);
  assert.equal(drawing.pointCount, 1);
  for (let i = 0; i < 25000; i++) drawing.contacts('hardware', [contact(1, i % 2)]);
  assert.equal(drawing.pointCount, 20000);
});
test('shared presets round-trip every mode without including unrelated URL data', () => {
  for (const mode of Object.keys(AdaptiveTriggers.presets)) {
    const setup = AdaptiveTriggers.setup.normalize({ mode, strength: 8 });
    const url = AdaptiveTriggers.setup.link('https://example.test/controller.html?analytics_test=1#other', setup);
    assert.equal(new URL(url).search, '');
    assert.deepEqual(AdaptiveTriggers.setup.read(url), setup);
  }
  assert.equal(AdaptiveTriggers.setup.read('https://example.test/#ordinary-anchor'), null);
});
test('malformed or out-of-range shared settings never reach the hardware encoder', () => {
  for (const config of [{ mode: '__proto__' }, { mode: 'lmg', strength: 0 }, { mode: 'lmg', strength: 9 }, { mode: 'lmg', speed: 31 }, { mode: 'smg', speed: .5 }, { mode: 'shooting', speed: 10 }]) {
    assert.throws(() => AdaptiveTriggers.setup.normalize(config));
  }
  for (const hash of ['trigger=2', 'trigger=1&mode=lmg&strength=abc&speed=10', 'trigger=1&mode=smg&strength=8&speed=0']) assert.throws(() => AdaptiveTriggers.setup.read('https://example.test/#' + hash));
});
test('custom strength and pulse speed affect both trigger packets while Off ignores tuning', () => {
  const effect = AdaptiveTriggers.effect(true, 'lmg', { strength: 8, speed: 30 });
  assert.equal(effect[0], 0x26); assert.equal(effect[9], 30);
  const forces = new DataView(effect.buffer).getUint32(3, true);
  for (let zone = 3; zone < 10; zone++) assert.equal((forces >>> (zone * 3)) & 7, 7);
  assert.equal(AdaptiveTriggers.effect(true, 'shotgun', { strength: 1, speed: 0 })[3], 0);
  const transport = { name: 'USB', length: 47, offset: 0, reportId: 2 };
  const packet = AdaptiveTriggers.packet(transport, true, 0, 'lmg', { strength: 8, speed: 30 });
  assert.deepEqual(packet.slice(10, 21), effect); assert.deepEqual(packet.slice(21, 32), effect);
  assert.deepEqual(AdaptiveTriggers.effect(false, 'lmg', { strength: 8, speed: 30 }), AdaptiveTriggers.effect(false));
});
const pad = (axes = [0, 0, 0, 0], values = [], id = 'DualSense') => ({ id, index: 0, connected: true, mapping: 'standard', axes, buttons: Array.from({ length: 18 }, (_, i) => ({ value: values[i] || 0 })) });
test('resting stick measurement preserves tiny raw offsets and captures mean and peak', () => {
  const model = new ControllerDiagnostics(); assert.equal(model.measure(0), false);
  model.sample(pad([.002, -.004, .03, .04]), 0); model.measure(0);
  model.sample(pad([.002, -.004, .03, .04]), 1000);
  model.sample(pad([.004, -.006, 0, 0]), 2000);
  assert.deepEqual(model.center.axes, [.003, -.005, .015, .02]);
  assert.equal(model.center.peaks[1], .05); assert.equal(model.measurement, null);
});
test('diagnostics observe full trigger travel and count press edges with release confirmation', () => {
  const model = new ControllerDiagnostics(); model.sample(pad(), 0);
  const values = []; values[0] = 1; values[6] = .4; values[7] = 1;
  model.sample(pad(undefined, values), 1); model.sample(pad(undefined, values), 2);
  assert.equal(model.buttons[0].presses, 1); assert.equal(model.buttons[0].down, true);
  values[0] = 0; values[6] = 1; values[7] = .2; model.sample(pad(undefined, values), 3);
  assert.equal(model.buttons[0].released, true); assert.equal(model.buttons[0].down, false);
  assert.deepEqual(model.travel, [{ min: 0, max: 1 }, { min: 0, max: 1 }]);
});
test('disconnect, switching controllers and cancelling prevent measurements crossing sessions', () => {
  const model = new ControllerDiagnostics(); model.sample(pad(), 0); model.measure(0); model.cancelMeasure(); model.sample(pad(), 3000);
  assert.equal(model.center, null);
  model.measure(3000); model.sample(pad(undefined, [], 'Other'), 4000); assert.equal(model.measurement, null);
  model.measure(4000); model.sample(null, 5000); assert.equal(model.device, null); assert.equal(model.buttons.length, 0);
});
test('scorecard result records only fired weapons and survives replay unchanged', () => {
  const game = new TargetPractice(); game.start(); assert.equal(game.result(), null);
  game.trigger(0); game.trigger(1); game.setWeapon('shotgun'); game.step(1); game.trigger(0); game.trigger(1);
  game.setWeapon('smg'); game.step(20);
  const result = game.result(); assert.deepEqual(result.weapons, ['shooting', 'shotgun']); assert.equal(result.shots, 2);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.weapons));
  game.start(); assert.equal(game.shots, 0); assert.equal(result.shots, 2); game.step(20); assert.deepEqual(game.result().weapons, []);
});
