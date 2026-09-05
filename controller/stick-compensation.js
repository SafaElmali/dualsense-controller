// Session-only correction. Never writes calibration to the controller.
export class StickCompensation {
  clear() { this.profile = null; }
  apply(device, sample) {
    if (!device || !sample || sample.count < 30 || !sample.ranges || sample.axes.some(value => !Number.isFinite(value)) || sample.peaks.some(value => value > .3) || sample.ranges.some(value => value > .08)) {
      throw new Error('The sticks moved too much, or the offset is too large. Let go and measure again.');
    }
    const jitter = Math.max(...sample.ranges);
    this.profile = { device, center: [...sample.axes], deadzone: Math.max(.03, Math.min(.25, jitter * 1.5 + .02)) };
  }
  setDeadzone(value) { if (this.profile && Number.isFinite(value)) this.profile.deadzone = Math.max(.02, Math.min(.3, value)); }
  axis(device, side, x, y) {
    const raw = [x, y].map(value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0);
    if (!this.profile || this.profile.device !== device) return { x: Math.abs(raw[0]) < .075 ? 0 : raw[0], y: Math.abs(raw[1]) < .075 ? 0 : raw[1] };
    const offset = side === 'left' ? 0 : 2;
    const shifted = raw.map((value, i) => {
      const center = this.profile.center[offset + i], delta = value - center;
      return delta / (delta >= 0 ? 1 - center : 1 + center);
    });
    const length = Math.hypot(...shifted), deadzone = this.profile.deadzone;
    if (length <= deadzone) return { x: 0, y: 0 };
    const scale = Math.min(1, (length - deadzone) / (1 - deadzone)) / length;
    return { x: shifted[0] * scale, y: shifted[1] * scale };
  }
}
