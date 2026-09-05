// DualSense report layout and sensor units: Sony's hid-playstation driver.
// Input DataViews exclude report ID; calibration feature data may include it.
export class GyroInput {
  constructor(onMotion = () => {}, onStatus = () => {}, now = () => performance.now()) {
    this.onMotion = onMotion; this.onStatus = onStatus; this.now = now;
    this.generation = 0; this.device = null; this.enabled = false; this.paused = false; this.scale = null; this.bias = [0, 0, 0]; this.previous = null; this.measurement = null;
    this.onReport = event => {
      if (event.device !== this.device || !this.enabled || this.paused) return;
      const sample = GyroInput.decode(event.reportId, event.data, this.scale);
      if (!sample) return;
      this.lastReport = this.now();
      if (!this.received) { this.received = true; this.onStatus('Gyro connected. Rotate the controller, or play target practice to aim with motion.'); }
      if (this.measurement) {
        const m = this.measurement;
        if (sample.rates.some(value => Math.abs(value) > 8)) { this.measurement = null; this.onStatus('Controller moved. Put it on a stable surface and try Recenter again.'); return; }
        sample.rates.forEach((value, i) => { m.sums[i] += value; m.min[i] = Math.min(m.min[i], value); m.max[i] = Math.max(m.max[i], value); }); m.count++;
        if (this.now() - m.start >= 1500 && m.count >= 30) { if (m.max.some((value, i) => value - m.min[i] > 1.5)) { this.measurement = null; this.onStatus('Controller moved. Keep it still and try Recenter again.'); return; } this.bias = m.sums.map(sum => sum / m.count); this.measurement = null; this.onStatus('Gyro centered. Pick up your controller and move to aim.'); }
        this.previous = null; return;
      }
      const dt = this.previous === null ? 0 : ((sample.timestamp - this.previous) >>> 0) / 3000000;
      this.previous = sample.timestamp;
      if (dt <= 0 || dt > .1) return;
      const rates = sample.rates.map((value, i) => Math.abs(value - this.bias[i]) < .35 ? 0 : value - this.bias[i]);
      this.onMotion({ pitch: rates[0], yaw: rates[1], roll: rates[2], dt });
    };
  }
  static calibration(data) {
    const start = data?.byteLength === 41 && data.getUint8(0) === 5 ? 1 : data?.byteLength === 40 ? 0 : null;
    if (start === null) return null;
    const read = offset => data.getInt16(start + offset, true), speed = read(18) + read(20);
    const scales = [0, 1, 2].map(i => speed / (Math.abs(read(6 + i * 4) - read(i * 2)) + Math.abs(read(8 + i * 4) - read(i * 2))));
    return scales.every(value => Number.isFinite(value) && value > .001 && value < 1) ? scales : null;
  }
  static decode(reportId, data, scale = null) {
    const offset = reportId === 1 && data.byteLength === 63 ? 0 : reportId === 0x31 && data.byteLength === 77 ? 1 : null;
    if (offset === null) return null;
    return { rates: [0, 1, 2].map(i => data.getInt16(offset + 15 + i * 2, true) * (scale?.[i] ?? 1 / 16)), timestamp: data.getUint32(offset + 27, true) };
  }
  attach(device) {
    if (device === this.device) return;
    this.device?.removeEventListener('inputreport', this.onReport);
    this.device = device; this.setEnabled(false); this.scale = null; this.bias = [0, 0, 0];
    device?.addEventListener('inputreport', this.onReport);
    if (!device) this.onStatus('Gyro disconnected. Enable it again after reconnecting.');
  }
  async enable() {
    const device = this.device; if (!device) return false;
    this.setEnabled(true); const generation = this.generation; this.received = false; this.lastReport = this.now();
    this.onStatus('Waiting for gyro data… Move your controller.');
    // Also requests full Bluetooth reports. Read-only: no factory calibration writes.
    let timeout;
    try {
      const data = await Promise.race([device.receiveFeatureReport(5), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 2500); })]);
      if (device === this.device && this.enabled && generation === this.generation) { this.scale = GyroInput.calibration(data); this.previous = null; }
    } catch { /* Nominal sensitivity works when factory calibration cannot be read. */ }
    finally { clearTimeout(timeout); }
    return device === this.device && this.enabled && generation === this.generation;
  }
  setEnabled(enabled) { this.generation++; this.enabled = enabled; this.previous = null; this.measurement = null; }
  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused; this.previous = null;
    if (this.measurement) { this.measurement = null; this.onStatus('Centering paused. Return and choose Recenter again.'); }
  }
  recenter() {
    if (!this.enabled || !this.device) return false;
    this.previous = null; this.measurement = { start: this.now(), sums: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], count: 0 };
    this.onStatus('Leave the controller still on a flat surface for 1.5 seconds…'); return true;
  }
}
