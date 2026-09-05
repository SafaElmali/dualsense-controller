import test from 'node:test';
import assert from 'node:assert/strict';
import { GyroInput } from '../controller/gyro-input.js';
import { ControllerAnalytics } from '../controller/analytics-service.js';
import { TargetPracticeView } from '../controller/target-practice-view.js';
import { TargetPractice } from '../controller/target-practice.js';

function packet(reportId = 1, rates = [160, -320, 480], timestamp = 30000) {
  const data = new DataView(new ArrayBuffer(reportId === 1 ? 63 : 77)), start = reportId === 1 ? 0 : 1;
  rates.forEach((value, i) => data.setInt16(start + 15 + i * 2, value, true)); data.setUint32(start + 27, timestamp, true); return data;
}
function device(feature = async () => new DataView(new ArrayBuffer(0))) {
  return { listeners: new Set(), receiveFeatureReport: feature, addEventListener(_, listener) { this.listeners.add(listener); }, removeEventListener(_, listener) { this.listeners.delete(listener); }, emit(data, reportId = 1) { for (const listener of this.listeners) listener({ device: this, data, reportId }); } };
}
test('USB and Bluetooth gyro decode signed axes and timestamps, rejecting unsupported layouts', () => {
  for (const id of [1, 0x31]) assert.deepEqual(GyroInput.decode(id, packet(id)), { rates: [10, -20, 30], timestamp: 30000 });
  assert.equal(GyroInput.decode(1, new DataView(new ArrayBuffer(9))), null);
  assert.equal(GyroInput.decode(2, packet()), null);
});
test('factory sensitivity handles feature reports with or without ID and rejects corrupt scales', () => {
  for (const offset of [0, 1]) {
    const data = new DataView(new ArrayBuffer(40 + offset)); if (offset) data.setUint8(0, 5);
    data.setInt16(offset + 18, 500, true); data.setInt16(offset + 20, 500, true);
    for (let i = 0; i < 3; i++) { data.setInt16(offset + 6 + i * 4, 8000, true); data.setInt16(offset + 8 + i * 4, -8000, true); }
    assert.deepEqual(GyroInput.calibration(data), [.0625, .0625, .0625]);
  }
  assert.equal(GyroInput.calibration(new DataView(new ArrayBuffer(40))), null);
});
test('gyro integrates sensor time across wrap, drops stale gaps, and pauses without catch-up', async () => {
  const motions = [], gyro = new GyroInput(value => motions.push(value)), pad = device(); gyro.attach(pad); await gyro.enable();
  pad.emit(packet(1, [160, 0, 0], 0xfffffff0)); pad.emit(packet(1, [160, 0, 0], 29984));
  assert.equal(motions.length, 1); assert.equal(motions[0].dt, .01); assert.equal(motions[0].pitch, 10);
  pad.emit(packet(1, [160, 0, 0], 30000000)); assert.equal(motions.length, 1);
  gyro.setPaused(true); pad.emit(packet()); gyro.setPaused(false); pad.emit(packet()); assert.equal(motions.length, 1);
  pad.emit(packet(1, [160, 0, 0], 60000)); assert.equal(motions.length, 2);
  gyro.attach(null); assert.equal(pad.listeners.size, 0); assert.equal(gyro.enabled, false);
});
test('gyro recenter measures stationary bias, rejects movement and cancels on blur', async () => {
  let now = 0; const motions = [], statuses = [], gyro = new GyroInput(m => motions.push(m), s => statuses.push(s), () => now), pad = device(); gyro.attach(pad); await gyro.enable();
  gyro.recenter();
  for (let i = 0; i <= 40; i++) { now = i * 40; pad.emit(packet(1, [16, -16, 0], i * 120000)); }
  assert.deepEqual(gyro.bias, [1, -1, 0]); assert.equal(gyro.measurement, null);
  pad.emit(packet(1, [16, -16, 0], 4920000)); pad.emit(packet(1, [16, -16, 0], 5040000)); assert.equal(motions.at(-1).pitch, 0);
  gyro.recenter(); pad.emit(packet(1, [1600, 0, 0])); assert.equal(gyro.measurement, null); assert.match(statuses.at(-1), /moved/);
  gyro.recenter(); gyro.setPaused(true); assert.equal(gyro.measurement, null);
});
test('late calibration cannot re-enable an Off or disconnected gyro', async () => {
  let resolve; const pad = device(() => new Promise(done => { resolve = done; })), gyro = new GyroInput(); gyro.attach(pad);
  const pending = gyro.enable(); gyro.setEnabled(false); resolve(new DataView(new ArrayBuffer(40)));
  assert.equal(await pending, false); assert.equal(gyro.enabled, false);
  const second = gyro.enable(); gyro.attach(null); resolve(new DataView(new ArrayBuffer(40)));
  assert.equal(await second, false); assert.equal(pad.listeners.size, 0);
});
test('motion aiming moves playing rounds only and remains bounded', () => {
  const game = new TargetPractice(), view = { game }; game.start();
  TargetPracticeView.prototype.motion.call(view, { pitch: 10, yaw: -20, dt: .05 }); assert.deepEqual(game.aim, { x: 512, y: 274 });
  game.pause(); TargetPracticeView.prototype.motion.call(view, { pitch: 20, yaw: 20, dt: 1 }); assert.deepEqual(game.aim, { x: 512, y: 274 });
  game.resume(); TargetPracticeView.prototype.motion.call(view, { pitch: 2000, yaw: -2000, dt: .1 }); assert.deepEqual(game.aim, { x: 980, y: 30 });
});
test('motion analytics never include sensor data or device identifiers', () => {
  const events = [], analytics = new ControllerAnalytics((event, props) => events.push({ event, props }));
  analytics.featureAction('gyro', 'enabled', { pitch: 100, device: 'private' });
  assert.deepEqual(events.find(e => e.event === 'controller_gyro_enabled').props, {});
});
