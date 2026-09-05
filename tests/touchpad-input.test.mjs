import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchpadInput } from '../controller/touchpad-input.js';

function report(bluetooth = false, points = []) {
  const bytes = new Uint8Array(bluetooth ? 77 : 63);
  const offset = bluetooth ? 33 : 32;
  bytes[offset] = bytes[offset + 4] = 0x80;
  points.forEach(({ id, x, y }, slot) => {
    const start = offset + slot * 4;
    bytes.set([id, x & 255, ((y & 15) << 4) | ((x >> 8) & 15), y >> 4], start);
  });
  return { reportId: bluetooth ? 0x31 : 1, data: new DataView(bytes.buffer) };
}

test('USB and Bluetooth decode independent contacts at the full touchpad range', () => {
  for (const bluetooth of [false, true]) {
    const event = report(bluetooth, [{ id: 7, x: 0, y: 0 }, { id: 32, x: 1919, y: 1079 }]);
    assert.deepEqual(TouchpadInput.decode(event.reportId, event.data), [{ id: 7, x: 0, y: 0 }, { id: 32, x: 1, y: 1 }]);
    const lifted = report(bluetooth);
    assert.deepEqual(TouchpadInput.decode(lifted.reportId, lifted.data), []);
  }
});

test('ignores short/basic reports and clamps corrupt coordinates', () => {
  assert.equal(TouchpadInput.decode(1, new DataView(new ArrayBuffer(9))), null);
  assert.equal(TouchpadInput.decode(0x31, new DataView(new ArrayBuffer(40))), null);
  assert.equal(TouchpadInput.decode(2, new DataView(new ArrayBuffer(63))), null);
  const event = report(false, [{ id: 1, x: 4095, y: 4095 }]);
  assert.deepEqual(TouchpadInput.decode(event.reportId, event.data), [{ id: 1, x: 1, y: 1 }]);
});

test('tracks movement without clicking, clears on blur/unplug, and removes old listeners', async () => {
  const listeners = new Set(); const frames = []; const features = [];
  const device = {
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
    receiveFeatureReport: async id => { features.push(id); },
  };
  const touchpad = new TouchpadInput(points => frames.push(points));
  await touchpad.attach(device, true); await touchpad.attach(device, true);
  assert.deepEqual(features, [5]); assert.equal(listeners.size, 1);
  const first = report(true, [{ id: 1, x: 500, y: 200 }]);
  for (const listener of listeners) listener({ device, ...first });
  assert.equal(frames.at(-1)[0].x, 500 / 1919);
  const next = report(true, [{ id: 1, x: 1000, y: 500 }]);
  for (const listener of listeners) listener({ device, ...next });
  assert.equal(frames.at(-1)[0].x, 1000 / 1919);
  touchpad.setPaused(true);
  for (const listener of listeners) listener({ device, ...next });
  assert.deepEqual(frames.at(-1), []);
  touchpad.setPaused(false);
  for (const listener of listeners) listener({ device, ...next });
  assert.equal(frames.at(-1).length, 1);
  await touchpad.attach(null);
  assert.equal(listeners.size, 0); assert.deepEqual(frames.at(-1), []);
});

test('failed Bluetooth feature reads offer USB without losing the input listener', async () => {
  const statuses = [];
  const service = new TouchpadInput(() => {}, (_, message) => statuses.push(message));
  await service.attach({ addEventListener() {}, receiveFeatureReport: async () => { throw Error(); } }, true);
  assert.match(statuses.at(-1), /USB/);
});

test('turning touchpad off clears contacts and ignores movement without closing the shared device', async () => {
  const listeners = new Set(), frames = [], statuses = [];
  const device = { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener), close() { assert.fail('Shared device must stay open'); } };
  const touchpad = new TouchpadInput(points => frames.push(points), (connected, message) => statuses.push({ connected, message }));
  await touchpad.attach(device);
  const input = report(false, [{ id: 1, x: 500, y: 300 }]);
  for (const listener of listeners) listener({ device, ...input });
  assert.equal(frames.at(-1).length, 1);
  touchpad.setEnabled(false); assert.deepEqual(frames.at(-1), []);
  touchpad.setPaused(true); touchpad.setPaused(false); await touchpad.attach(device);
  for (const listener of listeners) listener({ device, ...input });
  assert.deepEqual(frames.at(-1), []); assert.equal(touchpad.device, device); assert.equal(listeners.size, 1);
  assert.equal(statuses.at(-1).connected, true); assert.match(statuses.at(-1).message, /off/);
  touchpad.setEnabled(true);
  for (const listener of listeners) listener({ device, ...input });
  assert.equal(frames.at(-1).length, 1);
});

test('a late Bluetooth feature failure cannot overwrite a deliberate touchpad Off', async () => {
  let reject; const statuses = [];
  const device = { addEventListener() {}, receiveFeatureReport: () => new Promise((_, fail) => { reject = fail; }) };
  const touchpad = new TouchpadInput(() => {}, (_, message) => statuses.push(message));
  const pending = touchpad.attach(device, true); touchpad.setEnabled(false); reject(Error('Bluetooth unavailable')); await pending;
  assert.equal(touchpad.enabled, false); assert.match(statuses.at(-1), /off/);
});
