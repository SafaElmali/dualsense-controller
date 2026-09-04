// Shared input service: each device owns its contribution until it releases it.
export class ControllerInput {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.buttons = new Map();
    this.sticks = { left: new Map(), right: new Map() };
  }

  setButton(id, source, value) {
    value = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const held = this.buttons.get(id) || new Map();
    if ((held.get(source) || 0) === value) return;
    const before = this.button(id);
    if (value) held.set(source, value);
    else held.delete(source);
    if (held.size) this.buttons.set(id, held);
    else this.buttons.delete(id);
    this.onChange({ type: 'button', id, value: this.button(id), before });
  }

  button(id) {
    const held = this.buttons.get(id);
    return held?.size ? Math.max(...held.values()) : 0;
  }

  setAxis(side, source, x, y) {
    if (!this.sticks[side]) return;
    x = Number.isFinite(x) ? x : 0;
    y = Number.isFinite(y) ? y : 0;
    const length = Math.max(1, Math.hypot(x, y));
    const next = { x: x / length, y: y / length };
    const previous = this.sticks[side].get(source);
    if (previous && Math.abs(previous.x - next.x) < .0001 && Math.abs(previous.y - next.y) < .0001) return;
    this.sticks[side].set(source, next);
    this.onChange({ type: 'axis', side, ...this.axis(side) });
  }

  axis(side) {
    const stick = this.sticks[side];
    for (const source of ['pointer', 'keyboard', 'gamepad']) {
      if (stick.has(source)) return { ...stick.get(source) };
    }
    return { x: 0, y: 0 };
  }

  releaseAxis(side, source) {
    if (this.sticks[side].delete(source)) this.onChange({ type: 'axis', side, ...this.axis(side) });
  }

  releaseSource(source) {
    for (const id of [...this.buttons.keys()]) this.setButton(id, source, 0);
    for (const side of ['left', 'right']) this.releaseAxis(side, source);
  }

  reset() {
    const active = [...this.buttons.keys()];
    this.buttons.clear();
    for (const side of ['left', 'right']) this.sticks[side].clear();
    for (const id of active) this.onChange({ type: 'button', id, before: 1, value: 0 });
    for (const side of ['left', 'right']) this.onChange({ type: 'axis', side, x: 0, y: 0 });
  }
}
