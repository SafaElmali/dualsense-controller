export class TargetPractice {
  static weapons = Object.freeze({
    shooting: { label: 'Pistol', automatic: false, interval: .22, threshold: .56, spread: 0 },
    shotgun: { label: 'Shotgun', automatic: false, interval: .8, threshold: .67, spread: 30 },
    lmg: { label: 'LMG', automatic: true, interval: .1, threshold: .36, spread: 0 },
    smg: { label: 'SMG', automatic: true, interval: 1 / 18, threshold: .36, spread: 0 },
  });

  constructor({ random = Math.random, onShot = () => {} } = {}) {
    this.random = random; this.onShot = onShot;
    this.weapon = 'shooting'; this.state = 'ready';
    this.aim = { x: 500, y: 280 }; this.targets = [];
    this.weaponsUsed = new Set();
    this.elapsed = 0; this.score = 0; this.shots = 0; this.hits = 0; this.streak = 0;
    this.cooldown = 0; this.armed = false;
  }

  start() {
    this.weaponsUsed = new Set();
    this.elapsed = 0; this.score = 0; this.shots = 0; this.hits = 0; this.streak = 0;
    this.aim = { x: 500, y: 280 }; this.cooldown = 0; this.armed = false;
    this.targets = [];
    for (let i = 0; i < 3; i++) this.targets.push(this.spawn());
    this.state = 'playing';
  }

  get remaining() { return Math.max(0, 45 - this.elapsed); }
  get accuracy() { return this.shots ? Math.round(this.hits / this.shots * 100) : 0; }

  result() {
    if (this.state !== 'finished') return null;
    return Object.freeze({ score: this.score, hits: this.hits, shots: this.shots, weapons: Object.freeze([...this.weaponsUsed]) });
  }

  spawn() {
    let target;
    for (let attempt = 0; attempt < 30; attempt++) {
      target = { x: 130 + this.random() * 740, y: 125 + this.random() * 280, radius: 36, phase: this.random() * Math.PI * 2, respawnAt: null };
      if (this.targets.every(other => Math.hypot(other.x - target.x, other.y - target.y) > 150)) break;
    }
    return target;
  }

  position(target) {
    return { x: target.x + Math.sin(this.elapsed * 1.3 + target.phase) * 28, y: target.y + Math.cos(this.elapsed + target.phase) * 13 };
  }

  setAim(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.aim.x = Math.max(20, Math.min(980, x));
    this.aim.y = Math.max(30, Math.min(530, y));
  }

  setWeapon(weapon) {
    if (!Object.hasOwn(TargetPractice.weapons, weapon)) throw new Error('Unknown range weapon.');
    this.weapon = weapon; this.armed = false;
    // Switching cannot bypass the preceding shot's cooldown.
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.armed = false; } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.armed = false; } }
  stop() { this.state = 'ready'; this.armed = false; }

  step(dt, { x = 0, y = 0, pressure = 0 } = {}) {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(45, this.elapsed + dt);
    if (!this.remaining) { this.state = 'finished'; this.armed = false; return; }
    // Do not replay missed shots after a stalled frame or tab suspension.
    const movementTime = Math.min(dt, .05);
    this.setAim(this.aim.x + x * 520 * movementTime, this.aim.y + y * 520 * movementTime);
    this.cooldown = Math.max(0, this.cooldown) - dt;
    this.targets = this.targets.map(target => target.respawnAt !== null && this.elapsed >= target.respawnAt ? this.spawn() : target);
    this.trigger(pressure);
  }

  trigger(pressure) {
    if (this.state !== 'playing') return;
    if (pressure < .1) this.armed = true;
    const weapon = TargetPractice.weapons[this.weapon];
    if (pressure >= weapon.threshold && this.armed && this.cooldown <= 0) {
      this.#fire(); this.cooldown = weapon.interval + Math.max(-.05, this.cooldown);
      if (!weapon.automatic) this.armed = false;
    }
  }

  #fire() {
    const weapon = TargetPractice.weapons[this.weapon];
    this.shots++; this.weaponsUsed.add(this.weapon);
    const candidates = this.targets.filter(target => target.respawnAt === null).map(target => {
      const point = this.position(target);
      return { target, distance: Math.hypot(point.x - this.aim.x, point.y - this.aim.y) };
    }).filter(hit => hit.distance <= hit.target.radius + weapon.spread).sort((a, b) => a.distance - b.distance);
    const hit = candidates[0]; let points = 0;
    if (hit) {
      this.hits++; this.streak++;
      const center = hit.distance <= hit.target.radius * .35;
      points = (center ? 100 : 50) + Math.min(this.streak - 1, 5) * 10;
      this.score += points; hit.target.respawnAt = this.elapsed + .3;
    } else this.streak = 0;
    this.onShot({ x: this.aim.x, y: this.aim.y, hit: !!hit, points, weapon: this.weapon });
  }
}
