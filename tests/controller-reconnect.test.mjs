import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveTriggers } from '../controller/adaptive-triggers.js';
import { TouchpadInput } from '../controller/touchpad-input.js';
import { BatteryInput } from '../controller/battery-input.js';

function device() {
  return {
    vendorId: 0x054c, productId: 0x0ce6, opened: false, reports: [], listeners: new Set(),
    collections: [{ outputReports: [{ reportId: 2, items: [{ reportSize: 8, reportCount: 47 }] }] }],
    async open() { this.opened = true; }, async close() { this.opened = false; },
    async sendReport(id, bytes) { this.reports.push(bytes); },
    addEventListener(type, listener) { this.listeners.add(listener); },
    removeEventListener(type, listener) { this.listeners.delete(listener); },
  };
}
function setup(devices, onChange) {
  return new AdaptiveTriggers({
    getDevices: async () => devices, addEventListener() {},
    requestDevice() { assert.fail('Automatic reconnection must never show a permission picker'); },
  }, onChange);
}

test('a previously authorized controller starts default finger tracking with trigger effects off', async () => {
  const pad = device(), frames = [], touchpad = new TouchpadInput(points => frames.push(points));
  const service = setup([pad], state => { void touchpad.attach(state.device); });
  assert.equal(await service.reconnect(), true);
  assert.equal(touchpad.enabled, true); assert.equal(touchpad.device, pad);
  assert.equal(service.active, false); assert.equal(service.requested, false);
  assert.equal(pad.reports.length, 1); assert.equal(pad.reports[0][10], 5); assert.equal(pad.reports[0][21], 5);
  const data = new Uint8Array(63); data[32] = 1; data[33] = 200; data[36] = 128;
  for (const listener of pad.listeners) listener({ device: pad, reportId: 1, data: new DataView(data.buffer) });
  assert.equal(frames.at(-1).length, 1); assert.equal(frames.at(-1)[0].x, 200 / 1919);
});

test('no permission, multiple controllers, and unsupported devices leave selection to the user', async () => {
  for (const devices of [[], [device(), device()], [{ ...device(), vendorId: 1 }]]) {
    const service = setup(devices); assert.equal(await service.reconnect(), false);
    assert.ok(devices.every(pad => !pad.opened && pad.reports.length === 0));
  }
  const pad = device(), service = setup([{ ...device(), vendorId: 1 }, pad]);
  assert.equal(await service.reconnect(), true); assert.equal(service.device, pad);
});

test('pending permission lookup cannot reopen the controller after pause or disconnect', async () => {
  const pad = device(), service = setup([pad]); let finish;
  service.hid.getDevices = () => new Promise(resolve => { finish = resolve; });
  const pending = service.reconnect(); await service.disconnect(); finish([pad]);
  assert.equal(await pending, false); assert.equal(pad.opened, false); assert.equal(pad.reports.length, 0);
});

test('cancelling during device open closes the abandoned connection without sending effects', async () => {
  const pad = device(), service = setup([pad]); let finish, started;
  const opening = new Promise(resolve => { started = resolve; });
  pad.open = () => new Promise(resolve => { finish = () => { pad.opened = true; resolve(); }; started(); });
  const pending = service.reconnect(); await opening; await service.pause(); finish();
  assert.equal(await pending, false); assert.equal(pad.opened, false); assert.equal(pad.reports.length, 0);
});

test('rechecking an active connection preserves effects and a deliberate touchpad Off', async () => {
  const pad = device(), touchpad = new TouchpadInput();
  const service = setup([pad], state => { void touchpad.attach(state.device); });
  await service.reconnect(); await service.setEnabled(true); touchpad.setEnabled(false);
  const count = pad.reports.length; assert.equal(await service.reconnect(), true);
  assert.equal(service.active, true); assert.equal(touchpad.enabled, false); assert.equal(pad.reports.length, count);
});

test('restoring battery access works with touchpad Off and reads the first report after reconnect', async () => {
  const pad = device(), readings = [], touches = [];
  const battery = new BatteryInput(reading => readings.push(reading));
  const touchpad = new TouchpadInput(points => touches.push(points));
  touchpad.setEnabled(false);
  const service = setup([pad], state => { battery.attach(state.device); void touchpad.attach(state.device); });
  const report = level => {
    const data = new Uint8Array(63); data[32] = 1; data[33] = 200; data[36] = 128; data[52] = level;
    for (const listener of pad.listeners) listener({ device: pad, reportId: 1, data: new DataView(data.buffer) });
  };
  await service.reconnect(); report(0x19);
  assert.deepEqual(readings.at(-1), { level: 95, status: 'charging' });
  assert.equal(touchpad.enabled, false); assert.ok(touches.every(points => points.length === 0));
  await service.disconnect(); assert.equal(readings.at(-1), null);
  await service.reconnect(); report(0x07);
  assert.deepEqual(readings.at(-1), { level: 75, status: 'discharging' });
  assert.equal(service.active, false); assert.equal(touchpad.enabled, false);
});
