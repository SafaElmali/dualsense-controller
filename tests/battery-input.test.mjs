import test from 'node:test';
import assert from 'node:assert/strict';
import { BatteryInput } from '../controller/battery-input.js';

function report(value, bluetooth = false) {
  const bytes = new Uint8Array(bluetooth ? 77 : 63);
  bytes[bluetooth ? 53 : 52] = value;
  return { reportId: bluetooth ? 0x31 : 1, data: new DataView(bytes.buffer) };
}
function decode(value, bluetooth = false) {
  const event = report(value, bluetooth);
  return BatteryInput.decode(event.reportId, event.data);
}

test('USB and Bluetooth report the same coarse battery estimate and charging state', () => {
  for (const bluetooth of [false, true]) {
    assert.deepEqual(decode(0x08, bluetooth), { level: 85, status: 'discharging' });
    assert.deepEqual(decode(0x19, bluetooth), { level: 95, status: 'charging' });
    assert.deepEqual(decode(0x00, bluetooth), { level: 5, status: 'discharging' });
    assert.deepEqual(decode(0x0a, bluetooth), { level: 100, status: 'discharging' });
    assert.deepEqual(decode(0x1f, bluetooth), { level: 100, status: 'charging' });
    assert.deepEqual(decode(0x20, bluetooth), { level: 100, status: 'full' });
  }
});

test('charging faults and unknown states never claim an empty or full battery', () => {
  for (const state of [0xa, 0xb, 0xf]) assert.deepEqual(decode(state << 4 | 9), { level: null, status: 'error' });
  for (const state of [3, 4, 8, 0xe]) assert.deepEqual(decode(state << 4 | 9), { level: null, status: 'unknown' });
});

test('short Bluetooth packets, truncated data, and other report types have no battery reading', () => {
  for (const [id, length] of [[1, 9], [1, 52], [1, 77], [0x31, 53], [0x31, 63], [2, 63]]) {
    assert.equal(BatteryInput.decode(id, new DataView(new ArrayBuffer(length))), null);
  }
  const backing = new Uint8Array(100); backing[12 + 52] = 0x17;
  assert.deepEqual(BatteryInput.decode(1, new DataView(backing.buffer, 12, 63)), { level: 75, status: 'charging' });
});

function device() {
  const listeners = new Set();
  return {
    listeners,
    addEventListener(type, listener) { assert.equal(type, 'inputreport'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'inputreport'); listeners.delete(listener); },
    report(value) { for (const listener of listeners) listener({ device: this, ...report(value) }); },
    close() { assert.fail('Battery monitoring must not close the shared controller connection'); },
    sendReport() { assert.fail('Battery monitoring must not send output reports'); },
  };
}

test('high-frequency reports update the badge only when charge or charging state changes', () => {
  const readings = [], controller = device(), battery = new BatteryInput(reading => readings.push(reading));
  battery.attach(controller); battery.attach(controller);
  assert.equal(controller.listeners.size, 1); assert.deepEqual(readings, [null]);
  for (let i = 0; i < 100; i++) controller.report(0x09);
  assert.equal(readings.length, 2);
  controller.report(0x19); controller.report(0x18);
  assert.deepEqual(readings.slice(1), [{ level: 95, status: 'discharging' }, { level: 95, status: 'charging' }, { level: 85, status: 'charging' }]);
});

test('disconnect and device replacement clear stale charge and ignore late reports', () => {
  const readings = [], old = device(), next = device(), battery = new BatteryInput(reading => readings.push(reading));
  battery.attach(old); old.report(0x19);
  const lateReport = [...old.listeners][0];
  battery.attach(next);
  assert.equal(old.listeners.size, 0); assert.equal(next.listeners.size, 1); assert.equal(readings.at(-1), null);
  lateReport({ device: old, ...report(0x09) }); assert.equal(readings.at(-1), null);
  next.report(0x01); assert.deepEqual(readings.at(-1), { level: 15, status: 'discharging' });
  battery.attach(null); assert.equal(readings.at(-1), null); assert.equal(next.listeners.size, 0);
  lateReport({ device: next, ...report(0x19) }); assert.equal(readings.at(-1), null);
});
