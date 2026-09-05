import { ControllerDiagnostics } from './controller-diagnostics.js';

export class DiagnosticsView {
  constructor({ getPad, onOpen, onClose, labels }) {
    this.model = new ControllerDiagnostics(); this.getPad = getPad; this.onOpen = onOpen; this.onClose = onClose; this.labels = labels;
    this.dialog = document.getElementById('diagnostics'); this.frame = 0;
    this.$('diagnostics-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => { cancelAnimationFrame(this.frame); this.model.cancelMeasure(); this.onClose(); });
    this.$('diagnostics-reset').addEventListener('click', () => this.model.reset());
    this.$('diagnostics-measure').addEventListener('click', () => this.model.measure(performance.now()));
    window.addEventListener('blur', () => this.model.cancelMeasure());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.model.cancelMeasure(); });
  }
  $(id) { return document.getElementById(id); }
  get isOpen() { return this.dialog.open; }
  open() { this.model.reset(); this.onOpen(); this.dialog.showModal(); this.animate(performance.now()); }
  animate(time) {
    if (!this.isOpen) return;
    if (!document.hidden && document.hasFocus()) { const candidate = this.getPad(); const pad = candidate?.connected === false ? null : candidate; this.model.sample(pad, time); this.render(pad, time); }
    this.frame = requestAnimationFrame(next => this.animate(next));
  }
  render(pad, time) {
    const model = this.model;
    this.$('diagnostics-device').textContent = pad ? pad.id : 'Connect a controller and press any button to begin.';
    this.$('diagnostics-measure').disabled = !pad || !!model.measurement;
    this.$('diagnostics-measure').textContent = model.measurement ? 'Measuring…' : 'Measure resting sticks';
    this.$('diagnostics-measure-status').textContent = model.measurement ? 'Let go of both sticks… ' + Math.max(0, 2 - (time - model.measurement.start) / 1000).toFixed(1) + 's'
      : model.center ? 'Resting sample captured. Offset is distance from center; a small offset alone does not establish a fault.' : 'Let go of both sticks, then measure for two seconds. Readings have no added deadzone.';
    for (const [side, offset] of [['left', 0], ['right', 2]]) {
      const x = model.axes[offset], y = model.axes[offset + 1];
      this.$('diagnostics-' + side + '-dot').style.transform = `translate(${x * 55}px,${y * 55}px)`;
      this.$('diagnostics-' + side + '-values').textContent = pad ? `X ${x.toFixed(4)} · Y ${y.toFixed(4)}` : 'Waiting for controller';
      const center = model.center;
      this.$('diagnostics-' + side + '-center').textContent = center ? `Resting offset ${(Math.hypot(center.axes[offset], center.axes[offset + 1]) * 100).toFixed(2)}% · peak ${(center.peaks[offset / 2] * 100).toFixed(2)}%` : 'No resting sample yet';
    }
    for (let i = 0; i < 2; i++) {
      const prefix = 'diagnostics-' + (i ? 'r2' : 'l2'); const available = pad?.mapping === 'standard' && pad.buttons.length > i + 6;
      this.$(prefix).value = available ? model.values[i + 6] : 0;
      this.$(prefix + '-value').textContent = available ? Math.round(model.values[i + 6] * 100) + '%' : 'Unavailable';
      const travel = model.travel[i];
      this.$(prefix + '-travel').textContent = available ? `Observed ${Math.round(travel.min * 100)}% → ${Math.round(travel.max * 100)}%` : 'Requires a standard controller layout';
    }
    const container = this.$('diagnostics-buttons');
    if (container.children.length !== model.buttons.length) container.replaceChildren(...model.buttons.map(() => document.createElement('span')));
    model.buttons.forEach((button, i) => {
      const node = container.children[i];
      const label = pad?.mapping === 'standard' ? this.labels[i] || `Button ${i + 1}` : `Button ${i + 1}`;
      node.textContent = `${label} · ${button.down ? 'pressed' : button.released ? 'released' : 'untested'} · ${button.presses}`;
      node.className = button.down ? 'down' : button.released ? 'tested' : '';
    });
  }
  dispose() { cancelAnimationFrame(this.frame); }
}
