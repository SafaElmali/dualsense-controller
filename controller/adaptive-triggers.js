// Feedback encoding adapted from Nielk1's MIT-licensed trigger research.
// See TRIGGER-NOTICES.md for attribution and protocol references.
export class AdaptiveTriggers {
  static filters = [{ vendorId: 0x054c, productId: 0x0ce6 }, { vendorId: 0x054c, productId: 0x0df2 }];

  constructor(hid, onChange = () => {}) {
    this.hid = hid;
    this.onChange = onChange;
    this.device = null;
    this.transport = null;
    this.requested = false;
    this.active = false;
    this.generation = 0;
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.onDisconnect = ({ device }) => {
      if (device !== this.device) return;
      this.generation++; this.device = null; this.requested = false; this.active = false;
      this.update('Controller disconnected. Connect it again to enable trigger effects.');
    };
    hid?.addEventListener('disconnect', this.onDisconnect);
  }

  update(message) { this.onChange({ connected: !!this.device, active: this.active, message }); }

  static transportFor(device) {
    if (!AdaptiveTriggers.filters.some(filter => filter.vendorId === device.vendorId && filter.productId === device.productId)) {
      throw new Error('Choose a Sony DualSense or DualSense Edge controller.');
    }
    const reports = [];
    const visit = collection => {
      reports.push(...(collection.outputReports || []));
      for (const child of collection.children || []) visit(child);
    };
    for (const collection of device.collections || []) visit(collection);
    for (const report of reports) {
      const length = (report.items || []).reduce((sum, item) => sum + item.reportSize * item.reportCount, 0) / 8;
      if (report.reportId === 0x31 && length === 77) return { name: 'Bluetooth', reportId: 0x31, length, offset: 2 };
      if (report.reportId === 0x02 && [47, 62, 63].includes(length)) return { name: 'USB', reportId: 0x02, length, offset: 0 };
    }
    throw new Error('This controller connection is not supported. Try a USB data cable.');
  }

  static effect(enabled) {
    const bytes = new Uint8Array(11);
    bytes[0] = enabled ? 0x21 : 0x05;
    if (!enabled) return bytes;
    // Gentle feedback (3 of 8), beginning at zone 3 of 10.
    let zones = 0, forces = 0;
    for (let zone = 3; zone < 10; zone++) { zones |= 1 << zone; forces |= 2 << (zone * 3); }
    const view = new DataView(bytes.buffer);
    view.setUint16(1, zones, true); view.setUint32(3, forces, true);
    return bytes;
  }

  static packet(transport, enabled, sequence = 0) {
    const bytes = new Uint8Array(transport.length);
    const offset = transport.offset;
    // Only the two trigger-enable flags; do not change audio, lights, or rumble.
    bytes[offset] = 0x0c;
    bytes.set(AdaptiveTriggers.effect(enabled), offset + 10); // R2
    bytes.set(AdaptiveTriggers.effect(enabled), offset + 21); // L2
    if (transport.reportId === 0x31) {
      bytes[0] = (sequence & 15) << 4; bytes[1] = 0x10;
      let crc = 0xffffffff;
      for (const byte of [0xa2, 0x31, ...bytes.subarray(0, bytes.length - 4)]) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      new DataView(bytes.buffer).setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0, true);
    }
    return bytes;
  }

  async connect() {
    if (!this.hid) throw new Error('Use desktop Chrome or Edge to enable real trigger effects.');
    if (this.device) return this.setEnabled(true);
    const generation = ++this.generation;
    this.update('Choose your DualSense in the browser’s device picker.');
    const [device] = await this.hid.requestDevice({ filters: AdaptiveTriggers.filters });
    if (!device || generation !== this.generation) { this.update('No controller selected.'); return; }
    const transport = AdaptiveTriggers.transportFor(device);
    await device.open();
    if (generation !== this.generation) { await device.close(); return; }
    this.device = device; this.transport = transport; this.sequence = 0;
    // Reset any previous effect before taking control of the triggers.
    await this.setEnabled(false);
    if (generation === this.generation && this.device) await this.setEnabled(true);
  }

  setEnabled(enabled) {
    this.requested = enabled;
    const device = this.device, transport = this.transport;
    const operation = this.queue.then(async () => {
      if (!device || device !== this.device || !device.opened) return;
      const effect = this.requested;
      try {
        await device.sendReport(transport.reportId, AdaptiveTriggers.packet(transport, effect, this.sequence++));
        if (device !== this.device) return;
        this.active = effect;
        this.update(effect ? `${transport.name} connected. Squeeze L2 or R2 to feel resistance.` : 'Trigger effects off. Press Enable to try them again.');
      } catch {
        this.requested = false; this.active = false;
        // A failed write may still have reached the device. Attempt an explicit release.
        try { await device.sendReport(transport.reportId, AdaptiveTriggers.packet(transport, false, this.sequence++)); }
        catch { this.update('Could not release the triggers. Disconnect the controller to clear the effect.'); throw new Error('Controller communication failed. Disconnect and reconnect it.'); }
        this.update('Trigger effects stopped. Close other controller apps and try again.');
        throw new Error('Could not send the trigger effect. Close other controller apps and try again.');
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  pause() {
    this.generation++;
    return this.setEnabled(false);
  }

  async disconnect() {
    const device = this.device;
    await this.pause();
    if (device && device === this.device) {
      await device.close(); this.device = null; this.active = false;
      this.update('Controller released.');
    }
  }
}
