// WebHID payloads exclude the report ID. Battery buckets and charging states
// follow Sony's Linux hid-playstation driver; see TRIGGER-NOTICES.md.
export class BatteryInput {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.device = null;
    this.reading = null;
    this.onReport = event => {
      if (!this.device || event.device !== this.device) return;
      const reading = BatteryInput.decode(event.reportId, event.data);
      if (!reading || (reading.level === this.reading?.level && reading.status === this.reading?.status)) return;
      this.reading = reading;
      this.onChange(reading);
    };
  }

  static decode(reportId, data) {
    const offset = reportId === 0x01 && data.byteLength === 63 ? 52
      : reportId === 0x31 && data.byteLength === 77 ? 53 : null;
    if (offset === null) return null;
    const value = data.getUint8(offset), state = value >> 4;
    if (state === 2) return { level: 100, status: 'full' };
    if (state === 0 || state === 1) return {
      level: Math.min((value & 15) * 10 + 5, 100),
      status: state === 1 ? 'charging' : 'discharging',
    };
    // A charging fault does not mean that the battery is empty.
    return { level: null, status: [0xa, 0xb, 0xf].includes(state) ? 'error' : 'unknown' };
  }

  attach(device) {
    if (device === this.device) return;
    this.device?.removeEventListener('inputreport', this.onReport);
    this.device = device;
    this.reading = null;
    device?.addEventListener('inputreport', this.onReport);
    this.onChange(null);
  }
}
