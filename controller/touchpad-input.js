// WebHID payloads exclude the report ID. USB and full Bluetooth reports
// carry two 12-bit contacts; see TRIGGER-NOTICES.md for protocol references.
export class TouchpadInput {
  constructor(onChange = () => {}, onStatus = () => {}) {
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.device = null;
    this.paused = false;
    this.onReport = event => {
      if (event.device !== this.device || this.paused) return;
      const contacts = TouchpadInput.decode(event.reportId, event.data);
      if (contacts !== null) this.onChange(contacts);
    };
  }

  static decode(reportId, data) {
    const offset = reportId === 0x01 && data.byteLength === 63 ? 32
      : reportId === 0x31 && data.byteLength === 77 ? 33 : null;
    if (offset === null) return null;
    const contacts = [];
    for (let slot = 0; slot < 2; slot++) {
      const start = offset + slot * 4;
      const contact = data.getUint8(start);
      if (contact & 0x80) continue;
      const packed = data.getUint8(start + 2);
      const x = data.getUint8(start + 1) | ((packed & 15) << 8);
      const y = (packed >> 4) | (data.getUint8(start + 3) << 4);
      contacts.push({ id: contact & 127, x: Math.min(x, 1919) / 1919, y: Math.min(y, 1079) / 1079 });
    }
    return contacts;
  }

  async attach(device, bluetooth = false) {
    if (device === this.device) return;
    this.device?.removeEventListener('inputreport', this.onReport);
    this.device = device;
    this.onChange([]);
    if (!device) { this.onStatus(false, 'Connect your DualSense to follow your finger on its touchpad.'); return; }
    device.addEventListener('inputreport', this.onReport);
    this.onStatus(true, 'Move a finger on your DualSense touchpad. No click needed.');
    if (bluetooth) {
      try { await device.receiveFeatureReport(0x05); }
      catch {
        if (device === this.device) this.onStatus(true, 'If finger tracking is unavailable over Bluetooth, try a USB data cable.');
      }
    }
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.onChange([]);
  }
}
