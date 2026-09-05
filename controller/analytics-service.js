// Counts feature reach once per page visit and deliberate actions as they happen.
// Never sends raw input streams.
export class ControllerAnalytics {
  static featureActions = {
    touchpad_drawing: { opened: [], started: ['input_source'], cleared: [], exported: [], export_failed: [] },
    trigger_presets: { opened: [], changed: ['mode', 'strength', 'speed_hz'], reset: ['mode'], link_created: ['mode', 'strength', 'speed_hz'], link_copied: ['mode', 'strength', 'speed_hz'], loaded: ['mode', 'strength', 'speed_hz'] },
    diagnostics: { opened: [], connected: [], measurement_started: [], measurement_completed: [], reset: [] },
    target_practice: { started: ['mode'], completed: ['score', 'hits', 'shots', 'weapons'] },
    leaderboard: { opened: [], submitted: ['score'] },
    scorecard: { exported: ['score', 'hits', 'shots', 'weapons'], export_failed: [] },
  };

  constructor(capture = () => {}, now = () => performance.now()) {
    this.capture = capture;
    this.now = now;
    this.seen = new Set();
    this.lastActivity = null;
    this.lastSample = now();
    this.activeMilliseconds = 0;
  }

  send(event, properties = {}) {
    try { this.capture(event, properties); } catch { /* Analytics must not interrupt the controller. */ }
  }

  once(event, properties = {}, key = event) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.send(event, properties);
  }

  interact(kind) {
    this.sample();
    this.lastActivity = this.now();
    this.once('controller_interacted', { interaction: kind });
    this.once('controller_feature_used', { feature: kind }, 'feature:' + kind);
  }

  finish(value) {
    this.interact('finish');
    this.once('controller_finish_selected', { finish: value }, 'finish:' + value);
  }

  featureAction(feature, action, properties = {}) {
    if (!Object.hasOwn(ControllerAnalytics.featureActions, feature)) return;
    const actions = ControllerAnalytics.featureActions[feature];
    if (!Object.hasOwn(actions, action)) return;
    // Only the explicitly listed properties leave the browser. Do not forward
    // model objects, device IDs, URLs, artwork, or input coordinates.
    const payload = {};
    for (const key of actions[action]) {
      const value = properties[key];
      if (key === 'weapons' && Array.isArray(value)) payload.weapons = value.filter(mode => ['shooting', 'shotgun', 'lmg', 'smg'].includes(mode));
      else if (key === 'mode' && ['shooting', 'shotgun', 'lmg', 'smg', 'resistance'].includes(value)) payload.mode = value;
      else if (key === 'input_source' && ['hardware', 'pointer'].includes(value)) payload.input_source = value;
      else if (['score', 'hits', 'shots', 'strength', 'speed_hz'].includes(key) && Number.isFinite(value)) payload[key] = value;
    }
    if (Number.isFinite(payload.hits) && Number.isFinite(payload.shots)) payload.accuracy = payload.shots ? Math.round(payload.hits / payload.shots * 100) : 0;
    if (action !== 'loaded') this.interact(feature);
    const event = `controller_${feature}_${action}`;
    if (feature === 'touchpad_drawing' && action === 'started') this.once(event, payload, event + ':' + payload.input_source);
    else if (feature === 'diagnostics' && action === 'connected') this.once(event, payload);
    else this.send(event, payload);
  }

  sample() {
    const now = this.now();
    if (this.lastActivity !== null) {
      // Stop counting after five seconds without input, including background time.
      this.activeMilliseconds += Math.max(0, Math.min(now, this.lastActivity + 5000) - this.lastSample);
    }
    this.lastSample = now;
  }

  flush() {
    this.sample();
    const seconds = Math.floor(this.activeMilliseconds / 1000);
    if (seconds) {
      this.send('controller_active_time', { seconds });
      this.activeMilliseconds -= seconds * 1000;
    }
  }

  pause() {
    this.flush();
    this.lastActivity = null;
  }
}
