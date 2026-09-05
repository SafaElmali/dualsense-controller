export class TriggerSetup {
  constructor(presets) { this.presets = presets; }

  normalize({ mode, strength, speed } = {}) {
    if (!Object.hasOwn(this.presets, mode)) throw new Error('Choose a known trigger mode.');
    const preset = this.presets[mode];
    strength ??= preset.strength;
    speed ??= preset.frequency || 0;
    if (!Number.isInteger(strength) || strength < 1 || strength > 8) throw new Error('Strength must be between 1 and 8.');
    if (preset.type === 'vibration') {
      if (!Number.isInteger(speed) || speed < 1 || speed > 30) throw new Error('Pulse speed must be between 1 and 30 Hz.');
    } else if (speed !== 0) throw new Error('This trigger mode does not use pulses.');
    return { mode, strength, speed };
  }

  read(url) {
    const params = new URLSearchParams(new URL(url).hash.slice(1));
    if (!params.has('trigger')) return null;
    if (params.get('trigger') !== '1' || !params.get('strength') || !params.has('speed')) throw new Error('This trigger link is not valid.');
    return this.normalize({ mode: params.get('mode'), strength: Number(params.get('strength')), speed: Number(params.get('speed')) });
  }

  link(url, setup) {
    const values = this.normalize(setup);
    const result = new URL(url); result.search = '';
    result.hash = new URLSearchParams({ trigger: '1', mode: values.mode, strength: String(values.strength), speed: String(values.speed) }).toString();
    return result.href;
  }
}
