import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveTriggers } from '../controller/adaptive-triggers.js';

function device(reportId = 2, length = 47) {
  return {
    vendorId: 0x054c, productId: 0x0ce6, opened: false, reports: [],
    collections: [{ outputReports: [{ reportId, items: [{ reportSize: 8, reportCount: length }] }] }],
    async open() { this.opened = true; }, async close() { this.opened = false; },
    async sendReport(id, data) { this.reports.push({ id, data }); },
  };
}
function setup(pad = device()) {
  const listeners = {};
  const states = [];
  const hid = { requestDevice: async () => [pad], addEventListener: (name, handler) => { listeners[name] = handler; } };
  return { pad, hid, states, listeners, service: new AdaptiveTriggers(hid, state => states.push(state)) };
}

test('USB feedback enables only L2/R2 with the documented zone/strength encoding', () => {
  const transport = AdaptiveTriggers.transportFor(device());
  const packet = AdaptiveTriggers.packet(transport, true);
  assert.equal(packet.length, 47);
  assert.equal(packet[0], 0x0c);
  assert.deepEqual([...packet.slice(10, 21)], [0x21, 0xf8, 0x03, 0, 0x24, 0x49, 0x12, 0, 0, 0, 0]);
  assert.deepEqual(packet.slice(10, 21), packet.slice(21, 32));
  assert.ok([...packet.slice(1, 10), ...packet.slice(32)].every(byte => byte === 0));
  const off = AdaptiveTriggers.packet(transport, false);
  assert.equal(off[10], 5); assert.equal(off[21], 5);
  assert.equal(off.reduce((sum, byte) => sum + byte, 0), 22);
});

test('Bluetooth uses the full report, sequence nibble and standard CRC32 framing', () => {
  const transport = AdaptiveTriggers.transportFor(device(0x31, 77));
  const packet = AdaptiveTriggers.packet(transport, false, 17);
  assert.equal(packet.length, 77); assert.equal(packet[0], 0x10); assert.equal(packet[1], 0x10);
  assert.equal(packet[2], 0x0c); assert.equal(packet[12], 5); assert.equal(packet[23], 5);
  // Independent fixture calculated with Python zlib.crc32 over A2 31 + payload[:73].
  assert.equal(new DataView(packet.buffer).getUint32(73, true), 0x4eb8614f);
});

test('rejects unrelated devices and unknown report layouts', () => {
  assert.throws(() => AdaptiveTriggers.transportFor({ ...device(), vendorId: 1 }), /Sony/);
  assert.throws(() => AdaptiveTriggers.transportFor(device(2, 20)), /USB data cable/);
});

test('connection resets old effects, enables feedback, and releases before closing', async () => {
  const { service, pad } = setup();
  await service.connect(); assert.equal(service.active, true);
  assert.deepEqual(pad.reports.map(report => report.data[10]), [5, 0x21]);
  await service.disconnect();
  assert.equal(pad.reports.at(-1).data[10], 5); assert.equal(pad.opened, false); assert.equal(service.active, false);
});

test('leaving during device selection prevents effects from being enabled', async () => {
  const { service, hid, pad } = setup();
  let choose;
  hid.requestDevice = () => new Promise(resolve => { choose = resolve; });
  const connecting = service.connect(); await service.pause(); choose([pad]); await connecting;
  assert.equal(pad.opened, false); assert.equal(pad.reports.length, 0);
});

test('Off wins over an in-flight enable and hardware writes remain serialized', async () => {
  const { service, pad } = setup(); await service.connect(); await service.pause();
  let complete;
  pad.sendReport = async (id, data) => {
    pad.reports.push({ id, data });
    if (data[10] === 0x21) await new Promise(resolve => { complete = resolve; });
  };
  const enabling = service.setEnabled(true); await Promise.resolve();
  const stopping = service.pause(); complete(); await enabling; await stopping;
  assert.equal(service.active, false); assert.equal(pad.reports.at(-1).data[10], 5);
});

test('a rejected effect attempts release; unplugging clears the active state', async () => {
  const { service, pad, listeners } = setup(); await service.connect();
  pad.sendReport = async (id, data) => { pad.reports.push({ id, data }); if (data[10] === 0x21) throw new Error('busy'); };
  await assert.rejects(service.setEnabled(true), /Close other controller apps/);
  assert.equal(pad.reports.at(-1).data[10], 5); assert.equal(service.active, false);
  listeners.disconnect({ device: pad }); assert.equal(service.device, null);
});
