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
  const packet = AdaptiveTriggers.packet(transport, true, 0, 'resistance');
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

test('shooting encodes the native Weapon wall and release on both USB and Bluetooth', () => {
  for (const pad of [device(), device(0x31, 77)]) {
    const transport = AdaptiveTriggers.transportFor(pad);
    const packet = AdaptiveTriggers.packet(transport, true);
    const start = transport.offset + 10;
    assert.deepEqual([...packet.slice(start, start + 11)], [0x25, 0x28, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(packet.slice(start, start + 11), packet.slice(start + 11, start + 22));
  }
});

test('mode switching updates connected hardware but keeps disabled effects off', async () => {
  const { service, pad } = setup();
  await service.connect();
  await service.setMode('resistance');
  assert.equal(pad.reports.at(-1).data[10], 0x21);
  await service.setMode('shooting');
  assert.equal(pad.reports.at(-1).data[10], 0x25);
  await service.pause();
  await service.setMode('resistance');
  assert.equal(pad.reports.at(-1).data[10], 5);
  assert.equal(service.active, false);
  await service.connect();
  assert.equal(pad.reports.at(-1).data[10], 0x21);
  assert.throws(() => service.setMode('invalid'), /Unknown trigger effect/);
  assert.equal(service.mode, 'resistance');
});

test('Shotgun has a longer wall and stronger break than Pistol', () => {
  assert.deepEqual([...AdaptiveTriggers.effect(true, 'shotgun')], [0x25, 0x48, 0, 6, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...AdaptiveTriggers.effect(true, 'shooting')], [0x25, 0x28, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
});

test('LMG and SMG use native automatic cycling with distinct amplitude and cadence', () => {
  const lmg = AdaptiveTriggers.effect(true, 'lmg');
  const smg = AdaptiveTriggers.effect(true, 'smg');
  assert.deepEqual([...lmg], [0x26, 0xf8, 3, 0, 0xda, 0xb6, 0x2d, 0, 0, 10, 0]);
  assert.deepEqual([...smg], [0x26, 0xf8, 3, 0, 0x24, 0x49, 0x12, 0, 0, 18, 0]);
  // Independent Python zlib fixtures for active Bluetooth output, sequence zero.
  for (const [mode, crc] of [['lmg', 0x04097a3a], ['smg', 0xc612d1ca]]) {
    const packet = AdaptiveTriggers.packet(AdaptiveTriggers.transportFor(device(0x31, 77)), true, 0, mode);
    assert.equal(new DataView(packet.buffer).getUint32(73, true), crc);
  }
  for (const effect of [lmg, smg]) {
    const view = new DataView(effect.buffer);
    // Only the pulled portion is active, so relaxed triggers do not cycle.
    for (let zone = 0; zone < 3; zone++) assert.equal((view.getUint16(1, true) >> zone) & 1, 0);
    assert.equal(effect[7], 0); assert.equal(effect[8], 0); assert.equal(effect[10], 0);
  }
});

test('every preset replaces the previous effect on both triggers and releases with Off', async () => {
  for (const pad of [device(), device(0x31, 77)]) {
    const { service } = setup(pad); await service.connect();
    const offset = service.transport.offset;
    for (const mode of Object.keys(AdaptiveTriggers.presets)) {
      await service.setMode(mode);
      let packet = pad.reports.at(-1).data;
      assert.deepEqual(packet.slice(offset + 10, offset + 21), AdaptiveTriggers.effect(true, mode));
      assert.deepEqual(packet.slice(offset + 21, offset + 32), AdaptiveTriggers.effect(true, mode));
      await service.pause();
      packet = pad.reports.at(-1).data;
      assert.deepEqual(packet.slice(offset + 10, offset + 21), AdaptiveTriggers.effect(false));
      assert.deepEqual(packet.slice(offset + 21, offset + 32), AdaptiveTriggers.effect(false));
      await service.connect();
    }
    await service.disconnect();
    assert.equal(pad.opened, false);
  }
});

test('changing modes during a pending Off cannot re-enable the triggers', async () => {
  const { service, pad } = setup(); await service.connect();
  let complete;
  pad.sendReport = async (id, data) => {
    pad.reports.push({ id, data });
    if (data[10] === 0x21) await new Promise(resolve => { complete = resolve; });
  };
  const changing = service.setMode('resistance'); await Promise.resolve();
  const stopping = service.pause();
  const anotherMode = service.setMode('shooting');
  complete(); await Promise.all([changing, stopping, anotherMode]);
  assert.equal(service.active, false);
  assert.equal(pad.reports.at(-1).data[10], 5);
  assert.equal(service.requested, false);
});

test('rejects unrelated devices and unknown report layouts', () => {
  assert.throws(() => AdaptiveTriggers.transportFor({ ...device(), vendorId: 1 }), /Sony/);
  assert.throws(() => AdaptiveTriggers.transportFor(device(2, 20)), /USB data cable/);
});

test('connection resets old effects, enables shooting, and releases before closing', async () => {
  const { service, pad } = setup();
  await service.connect(); assert.equal(service.active, true);
  assert.deepEqual(pad.reports.map(report => report.data[10]), [5, 0x25]);
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
    if (data[10] === 0x25) await new Promise(resolve => { complete = resolve; });
  };
  const enabling = service.setEnabled(true); await Promise.resolve();
  const stopping = service.pause(); complete(); await enabling; await stopping;
  assert.equal(service.active, false); assert.equal(pad.reports.at(-1).data[10], 5);
});

test('a rejected effect attempts release; unplugging clears the active state', async () => {
  const { service, pad, listeners } = setup(); await service.connect();
  pad.sendReport = async (id, data) => { pad.reports.push({ id, data }); if (data[10] === 0x25) throw new Error('busy'); };
  await assert.rejects(service.setEnabled(true), /Close other controller apps/);
  assert.equal(pad.reports.at(-1).data[10], 5); assert.equal(service.active, false);
  listeners.disconnect({ device: pad }); assert.equal(service.device, null);
});
