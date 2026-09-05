// Trigger encoding adapted from Nielk1's MIT-licensed trigger research.
// See TRIGGER-NOTICES.md for attribution and protocol references.
import { TriggerSetup } from './trigger-setup.js';
export class AdaptiveTriggers {
  static filters = [{ vendorId: 0x054c, productId: 0x0ce6 }, { vendorId: 0x054c, productId: 0x0df2 }];
  static presets = Object.freeze(Object.fromEntries(Object.entries({
    shooting: { label: 'Pistol', type: 'weapon', start: 3, end: 5, strength: 5,
      description: 'A crisp resistance point, then a sudden release. Let go to fire again.' },
    shotgun: { label: 'Shotgun', type: 'weapon', start: 3, end: 6, strength: 7,
      description: 'A heavier, longer pull that breaks into a sharp release. Let go between shots.' },
    lmg: { label: 'LMG', type: 'vibration', start: 3, strength: 6, frequency: 10,
      description: 'Hold the trigger past the resistance point for a steady rhythm of strong pulses. Let go to stop.' },
    smg: { label: 'SMG', type: 'vibration', start: 3, strength: 3, frequency: 18,
      description: 'Hold the trigger down for faster, lighter pulses. Let go to stop.' },
    resistance: { label: 'Resistance', type: 'feedback', start: 3, strength: 3,
      description: 'A steady force pushes back as you squeeze either trigger.' },
  }).map(([name, preset]) => [name, Object.freeze(preset)])));

  static setup = new TriggerSetup(AdaptiveTriggers.presets);

  static presetFor(mode, tuning = null) {
    if (!Object.hasOwn(AdaptiveTriggers.presets, mode)) throw new Error('Unknown trigger effect.');
    const preset = AdaptiveTriggers.presets[mode];
    if (!tuning) return preset;
    const config = AdaptiveTriggers.setup.normalize({ ...tuning, mode });
    return { ...preset, strength: config.strength, frequency: config.speed };
  }

  constructor(hid, onChange = () => {}) {
    this.hid = hid;
    this.onChange = onChange;
    this.device = null;
    this.transport = null;
    this.mode = 'shooting';
    this.tuning = null;
    this.requested = false;
    this.active = false;
    this.generation = 0;
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.lightColor = null;
    this.lightConfiguredDevice = null;
    this.onDisconnect = ({ device }) => {
      if (device !== this.device) return;
      this.generation++; this.device = null; this.requested = false; this.active = false;
      this.stopLightSync(); this.lightConfiguredDevice = null;
      this.update('Controller disconnected. Connect it again to enable trigger effects.');
    };
    hid?.addEventListener('disconnect', this.onDisconnect);
  }

  update(message) { this.onChange({ device: this.device, connected: !!this.device, active: this.active, message }); }

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

  static effect(enabled, mode = 'shooting', tuning = null) {
    const bytes = new Uint8Array(11);
    bytes[0] = 0x05;
    if (!enabled) return bytes;
    const preset = AdaptiveTriggers.presetFor(mode, tuning);
    const view = new DataView(bytes.buffer);
    if (preset.type === 'weapon') {
      // Native Weapon: resist between two zones, then suddenly release.
      // Firmware rearms the effect when the trigger returns before the start zone.
      bytes[0] = 0x25;
      view.setUint16(1, (1 << preset.start) | (1 << preset.end), true);
      bytes[3] = preset.strength - 1;
      return bytes;
    }
    // Native Vibration cycles the trigger motor while physically pulled past start.
    // The controller handles timing and release; no polling or per-shot USB writes.
    bytes[0] = preset.type === 'vibration' ? 0x26 : 0x21;
    let zones = 0, forces = 0;
    for (let zone = preset.start; zone < 10; zone++) {
      zones |= 1 << zone; forces |= (preset.strength - 1) << (zone * 3);
    }
    view.setUint16(1, zones, true); view.setUint32(3, forces, true);
    if (preset.type === 'vibration') bytes[9] = preset.frequency;
    return bytes;
  }

  static packet(transport, enabled, sequence = 0, mode = 'shooting', tuning = null) {
    const bytes = new Uint8Array(transport.length);
    const offset = transport.offset;
    // Only the two trigger-enable flags; do not change audio, lights, or rumble.
    bytes[offset] = 0x0c;
    bytes.set(AdaptiveTriggers.effect(enabled, mode, tuning), offset + 10); // R2
    bytes.set(AdaptiveTriggers.effect(enabled, mode, tuning), offset + 21); // L2
    return AdaptiveTriggers.frame(transport, bytes, sequence);
  }

  static lightPacket(transport, color, sequence = 0, setup = false) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid six-digit light color.');
    const bytes = new Uint8Array(transport.length), offset = transport.offset;
    if (setup) {
      // Exit the firmware's startup light animation before setting RGB.
      bytes[offset + 38] = 0x02;
      bytes[offset + 41] = 0x02;
    } else {
      bytes[offset + 1] = 0x04; // RGB lightbar only; trigger and audio flags stay clear.
      bytes.set([1, 3, 5].map(start => Number.parseInt(color.slice(start, start + 2), 16)), offset + 44);
    }
    return AdaptiveTriggers.frame(transport, bytes, sequence);
  }

  static frame(transport, bytes, sequence) {
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

  setLightColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid six-digit light color.');
    const device = this.device, transport = this.transport;
    if (!device) throw new Error('Connect your DualSense to sync its light.');
    this.lightColor = color;
    const operation = this.queue.then(async () => {
      const available = () => device === this.device && device.opened && this.lightColor !== null;
      if (!available()) return false;
      try {
        if (this.lightConfiguredDevice !== device) {
          await device.sendReport(transport.reportId, AdaptiveTriggers.lightPacket(transport, this.lightColor, this.sequence++, true));
          if (!available()) return false;
          this.lightConfiguredDevice = device;
        }
        await device.sendReport(transport.reportId, AdaptiveTriggers.lightPacket(transport, this.lightColor, this.sequence++));
        return available();
      } catch {
        if (device === this.device) { this.stopLightSync(); this.lightConfiguredDevice = null; }
        throw new Error('Light sync failed. Close other controller apps, then try syncing again.');
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  stopLightSync() { this.lightColor = null; }

  async connect({ enableEffects = true } = {}) {
    if (!this.hid) throw new Error('Use desktop Chrome or Edge to enable real trigger effects.');
    if (this.device) return enableEffects ? this.setEnabled(true) : undefined;
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
    if (enableEffects && generation === this.generation && this.device) await this.setEnabled(true);
  }

  setMode(mode) {
    AdaptiveTriggers.presetFor(mode);
    this.mode = mode;
    this.tuning = null;
    // Preserve Off, including when a previous write is still in flight.
    return this.setEnabled(this.requested);
  }

  setTuning(values) {
    const { strength, speed } = AdaptiveTriggers.setup.normalize({ ...values, mode: this.mode });
    this.tuning = { strength, speed };
    return this.setEnabled(this.requested);
  }

  setEnabled(enabled) {
    this.requested = enabled;
    const device = this.device, transport = this.transport;
    const operation = this.queue.then(async () => {
      if (!device || device !== this.device || !device.opened) return;
      const effect = this.requested;
      const mode = this.mode;
      try {
        await device.sendReport(transport.reportId, AdaptiveTriggers.packet(transport, effect, this.sequence++, mode, this.tuning));
        if (device !== this.device) return;
        this.active = effect;
        this.update(effect ? `${transport.name} connected. ${AdaptiveTriggers.presetFor(mode).label} is active on L2 and R2.` : 'Trigger effects off. Press Enable to try them again.');
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
    this.stopLightSync(); this.lightConfiguredDevice = null;
    await this.pause();
    if (device && device === this.device) {
      await device.close(); this.device = null; this.active = false;
      this.update('Controller released.');
    }
  }
}
