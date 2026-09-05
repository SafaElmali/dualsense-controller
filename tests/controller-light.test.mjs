import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveTriggers } from '../controller/adaptive-triggers.js';

function setup(bluetooth = false) {
  const reports = [], listeners = {};
  const pad = {
    vendorId: 0x054c, productId: 0x0ce6, opened: false,
    collections: [{ outputReports: [{ reportId: bluetooth ? 0x31 : 2, items: [{ reportSize: 8, reportCount: bluetooth ? 77 : 47 }] }] }],
    async open() { this.opened = true; }, async close() { this.opened = false; },
    async sendReport(id, bytes) { reports.push({ id, bytes }); },
  };
  const service = new AdaptiveTriggers({ requestDevice: async () => [pad], addEventListener: (name, callback) => { listeners[name] = callback; } });
  return { pad, reports, service, listeners };
}

test('lightbar setup and RGB packets touch only LED fields over USB and Bluetooth', () => {
  for (const bluetooth of [false, true]) {
    const { pad } = setup(bluetooth), transport = AdaptiveTriggers.transportFor(pad), offset = transport.offset;
    const start = AdaptiveTriggers.lightPacket(transport, '#a855f7', 3, true);
    const color = AdaptiveTriggers.lightPacket(transport, '#a855f7', 3);
    assert.equal(start[offset + 38], 2); assert.equal(start[offset + 41], 2);
    assert.equal(color[offset + 1], 4); assert.deepEqual([...color.slice(offset + 44, offset + 47)], [168, 85, 247]);
    const allowed = new Set([1, 44, 45, 46]);
    assert.ok([...color.slice(offset, offset + 47)].every((byte, index) => !byte || allowed.has(index)));
    assert.ok([...start.slice(offset, offset + 47)].every((byte, index) => !byte || [38, 41].includes(index)));
    if (bluetooth) {
      // Independent Python zlib.crc32 fixtures over A2 31 + payload[:73].
      assert.equal(new DataView(start.buffer).getUint32(73, true), 0xb274fbb8);
      assert.equal(new DataView(color.buffer).getUint32(73, true), 0x6a8b18aa);
    }
  }
});

test('light sync initializes once, preserves active triggers, and shares their Bluetooth sequence', async () => {
  const { service, reports } = setup(true); await service.connect();
  assert.equal(service.active, true);
  await service.setLightColor('#ff0088'); await service.setLightColor('#52e2b1');
  assert.equal(service.active, true); assert.equal(service.requested, true);
  assert.deepEqual(reports.map(report => report.bytes[0] >> 4), [0, 1, 2, 3, 4]);
  assert.equal(reports.filter(report => report.bytes[40] === 2).length, 1);
  assert.deepEqual([...reports.at(-1).bytes.slice(46, 49)], [82, 226, 177]);
  await service.pause();
  assert.equal(service.active, false); assert.equal(reports.at(-1).bytes[12], 5);
  await service.setLightColor('#ffffff');
  assert.equal(reports.at(-1).bytes[2], 0); assert.equal(service.active, false);
});

test('stopping sync during setup prevents a queued color and leaves trigger Off intact', async () => {
  const { service, pad, reports } = setup(); await service.connect({ enableEffects: false });
  let release, started; const write = pad.sendReport;
  const setupStarted = new Promise(resolve => { started = resolve; });
  pad.sendReport = async (id, bytes) => { await write(id, bytes); if (bytes[38] === 2) await new Promise(resolve => { release = resolve; started(); }); };
  const pending = service.setLightColor('#a855f7');
  await setupStarted;
  service.stopLightSync(); release();
  assert.equal(await pending, false); assert.equal(service.lightColor, null);
  assert.equal(reports.some(report => report.bytes[1] === 4), false);
  assert.equal(service.active, false);
});

test('disconnect clears light ownership, skips late writes, and reinitializes after reconnect', async () => {
  const { service, pad, reports, listeners } = setup(); await service.connect({ enableEffects: false });
  const pending = service.setLightColor('#ffffff');
  listeners.disconnect({ device: pad }); await pending;
  assert.equal(service.lightColor, null); assert.equal(reports.length, 1);
  await service.connect({ enableEffects: false }); await service.setLightColor('#123456');
  assert.equal(reports.filter(report => report.bytes[38] === 2).length, 1);
  await service.disconnect(); assert.equal(service.lightColor, null); assert.equal(pad.opened, false);
});

test('invalid color and failed LED writes do not change trigger state or poison later writes', async () => {
  const { service, pad, reports } = setup(); await service.connect();
  for (const value of ['red', '#fff', '#zzffff', '#ffffffff', null]) assert.throws(() => service.setLightColor(value), /six-digit/);
  assert.equal(reports.length, 2);
  const write = pad.sendReport; pad.sendReport = async () => { throw Error('Unavailable'); };
  await assert.rejects(service.setLightColor('#a855f7'), /Light sync failed/);
  assert.equal(service.lightColor, null); assert.equal(service.active, true);
  pad.sendReport = write; await service.pause(); await service.setLightColor('#ffffff');
  assert.equal(service.active, false); assert.equal(reports.at(-1).bytes[1], 4);
});
