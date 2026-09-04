// Counts meaningful actions once per page visit; never sends raw input streams.
export class ControllerAnalytics {
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
