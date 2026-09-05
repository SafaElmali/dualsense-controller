// Chooses a useful viewing angle without chasing analog jitter or every frame.
export class InputCamera {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.enabled = true;
    this.view = 'front';
    this.held = new Set();
  }

  observe(event) {
    const id = event.type === 'axis' ? event.side + '-stick' : event.id;
    const value = event.type === 'axis' ? Math.hypot(event.x, event.y) : event.value;
    const wasHeld = this.held.has(id);
    const active = value > (wasHeld ? .05 : event.type === 'axis' ? .18 : .12);
    if (active === wasHeld) return;
    if (active) this.held.add(id); else this.held.delete(id);
    const next = this.held.has('l2') || this.held.has('r2') ? 'triggers'
      : this.held.has('l1') || this.held.has('r1') ? 'shoulders'
      : this.held.size ? 'front' : this.view;
    if (next === this.view) return;
    this.view = next;
    if (this.enabled) this.onChange(next);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.onChange(this.view);
  }

  reset() {
    this.held.clear(); this.view = 'front';
    this.setEnabled(true);
  }
}
