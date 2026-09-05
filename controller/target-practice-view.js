import { TargetPractice } from './target-practice.js';

export class TargetPracticeView {
  constructor({ input, onWeapon, onEnableEffects, onStopEffects, effectsActive, onShot, onOpen, onClose }) {
    this.input = input; this.onWeapon = onWeapon; this.onEnableEffects = onEnableEffects;
    this.onStopEffects = onStopEffects; this.effectsActive = effectsActive; this.onOpen = onOpen; this.onClose = onClose;
    this.dialog = document.getElementById('range');
    this.canvas = document.getElementById('range-canvas'); this.ctx = this.canvas.getContext('2d');
    this.keys = new Set(); this.impacts = []; this.previousTime = 0; this.frame = 0; this.pointer = null;
    this.game = new TargetPractice({ onShot: shot => {
      this.impacts.push({ ...shot, at: this.game.elapsed }); onShot?.();
    } });
    this.best = 0;
    try { this.best = Number(localStorage.getItem('dualsense-range-best')) || 0; } catch { /* Storage is optional. */ }
    this.$('range-weapon').replaceChildren(...Object.entries(TargetPractice.weapons).map(([key, weapon]) => new Option(weapon.label, key)));
    this.$('range-weapon').addEventListener('change', event => this.selectWeapon(event.target.value));
    this.$('range-start').addEventListener('click', () => this.start());
    this.$('range-pause').addEventListener('click', () => this.pause());
    this.$('range-close').addEventListener('click', () => this.close());
    this.$('range-effects').addEventListener('click', async () => {
      this.connecting = true; this.effectsError = null;
      try { await this.onEnableEffects(); }
      catch (error) { this.effectsError = error.message; }
      finally { this.connecting = false; }
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('close', () => this.cleanup());
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    window.addEventListener('keydown', event => this.key(event, true));
    window.addEventListener('keyup', event => this.key(event, false));
    this.canvas.addEventListener('pointermove', event => this.point(event));
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.game.state !== 'playing') return;
      event.preventDefault(); this.canvas.focus(); this.point(event);
      this.pointer = event.pointerId; this.canvas.setPointerCapture(event.pointerId);
      this.input.setButton('r2', 'range-pointer', 1);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(name, event => {
      if (event.pointerId !== this.pointer) return;
      this.pointer = null; this.input.setButton('r2', 'range-pointer', 0);
    });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.canvas);
  }

  $(id) { return document.getElementById(id); }
  get isOpen() { return this.dialog.open; }

  open(mode) {
    this.onOpen();
    this.game.setWeapon(Object.hasOwn(TargetPractice.weapons, mode) ? mode : 'shooting');
    this.game.start(); this.game.stop(); this.impacts = [];
    this.$('range-weapon').value = this.game.weapon;
    this.onWeapon(this.game.weapon);
    this.dialog.showModal(); this.resize(); this.update();
    this.previousTime = 0; this.frame = requestAnimationFrame(time => this.animate(time));
  }

  close() { this.dialog.close(); }
  dispose() { if (this.isOpen) this.cleanup(); cancelAnimationFrame(this.frame); this.observer.disconnect(); }
  cleanup() { cancelAnimationFrame(this.frame); this.release(); this.game.stop(); this.onStopEffects(); this.onClose(); }
  release() {
    this.keys.clear(); this.input.releaseSource('range-key'); this.input.releaseSource('range-pointer');
    this.input.releaseAxis('right', 'keyboard');
    if (this.pointer !== null && this.canvas.hasPointerCapture(this.pointer)) this.canvas.releasePointerCapture(this.pointer);
    this.pointer = null;
  }

  start() {
    this.release(); this.impacts = []; this.previousTime = 0;
    this.$('range-result').textContent = '';
    if (this.game.state === 'paused') this.game.resume(); else this.game.start();
    this.game.trigger(this.input.button('r2'));
    this.canvas.focus(); this.update();
  }

  pause() {
    if (!this.isOpen || this.game.state !== 'playing') return;
    this.game.pause(); this.release(); this.onStopEffects(); this.update();
  }

  selectWeapon(mode) {
    this.game.setWeapon(mode); this.$('range-weapon').value = mode;
    this.onWeapon(mode); this.canvas.focus();
  }

  handleInput(event) {
    if (!this.isOpen || event.type !== 'button') return;
    if (event.id === 'r2') this.game.trigger(event.value);
    if (!event.value || event.before) return;
    if (event.id === 'triangle') {
      const modes = Object.keys(TargetPractice.weapons);
      this.selectWeapon(modes[(modes.indexOf(this.game.weapon) + 1) % modes.length]);
    }
    if (event.id === 'cross' && this.game.state !== 'playing') this.start();
  }

  key(event, pressed) {
    if (!this.isOpen || event.ctrlKey || event.metaKey || event.altKey) return;
    if (pressed && event.target.closest?.('button,select,input')) return;
    const directions = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'];
    if (!directions.includes(event.code) && !['Space','Digit1','Digit2','Digit3','Digit4'].includes(event.code)) return;
    event.preventDefault();
    if (pressed) this.keys.add(event.code); else this.keys.delete(event.code);
    if (event.code === 'Space') this.input.setButton('r2', 'range-key', pressed ? 1 : 0);
    else if (event.code.startsWith('Digit') && pressed && !event.repeat) this.selectWeapon(Object.keys(TargetPractice.weapons)[Number(event.code.slice(-1)) - 1]);
    else if (directions.includes(event.code)) {
      const held = (...keys) => keys.some(key => this.keys.has(key));
      if (directions.some(key => this.keys.has(key))) this.input.setAxis('right', 'keyboard', Number(held('ArrowRight','KeyD')) - Number(held('ArrowLeft','KeyA')), Number(held('ArrowDown','KeyS')) - Number(held('ArrowUp','KeyW')));
      else this.input.releaseAxis('right', 'keyboard');
    }
  }

  point(event) {
    if (this.game.state !== 'playing') return;
    const rect = this.canvas.getBoundingClientRect();
    this.game.setAim((event.clientX - rect.left) / rect.width * 1000, (event.clientY - rect.top) / rect.height * 560);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); if (!rect.width) return;
    const ratio = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio);
    this.draw();
  }

  update() {
    const game = this.game;
    this.$('range-score').textContent = game.score.toLocaleString();
    this.$('range-time').textContent = Math.ceil(game.remaining) + 's';
    this.$('range-accuracy').textContent = game.accuracy + '%';
    this.$('range-streak').textContent = game.streak;
    this.$('range-best').textContent = this.best.toLocaleString();
    this.$('range-overlay').hidden = game.state === 'playing';
    this.$('range-pause').disabled = game.state !== 'playing';
    this.$('range-effects').disabled = this.connecting || this.effectsActive() || game.state === 'playing';
    this.$('range-effects').textContent = this.effectsActive() ? 'Adaptive triggers enabled' : 'Enable adaptive triggers';
    const title = game.state === 'finished' ? 'Round complete.' : game.state === 'paused' ? 'Take a breath.' : 'Make every shot count.';
    const summary = game.state === 'finished' ? `${game.score.toLocaleString()} points · ${game.hits}/${game.shots} hits · ${game.accuracy}% accuracy`
      : game.state === 'paused' ? 'Your timer is paused. Resume when you’re ready.' : '45 seconds. Moving targets. Your best shot.';
    this.$('range-title').textContent = title; this.$('range-summary').textContent = summary;
    this.$('range-start').textContent = game.state === 'paused' ? 'Resume round' : game.state === 'finished' ? 'Play again' : 'Start round';
    this.$('range-feedback').textContent = this.effectsError || (this.effectsActive() ? 'Adaptive triggers active · feel your selected weapon' : 'Play freely. To feel adaptive triggers, enable them before starting or while paused.');
  }

  animate(time) {
    if (!this.isOpen) return;
    this.frame = requestAnimationFrame(next => this.animate(next));
    const dt = this.previousTime ? (time - this.previousTime) / 1000 : 0; this.previousTime = time;
    const wasPlaying = this.game.state === 'playing';
    if (!document.hidden && document.hasFocus()) this.game.step(dt, { ...this.input.axis('right'), pressure: this.input.button('r2') });
    if (wasPlaying && this.game.state === 'finished') {
      this.release(); this.onStopEffects();
      this.best = Math.max(this.best, this.game.score);
      try { localStorage.setItem('dualsense-range-best', String(this.best)); } catch { /* Storage is optional. */ }
      this.$('range-result').textContent = `Round complete: ${this.game.score} points and ${this.game.accuracy}% accuracy.`;
    }
    this.impacts = this.impacts.filter(impact => this.game.elapsed - impact.at < .4);
    this.update(); this.draw();
  }

  draw() {
    const ctx = this.ctx; if (!ctx || !this.canvas.width) return;
    ctx.setTransform(this.canvas.width / 1000, 0, 0, this.canvas.height / 560, 0, 0);
    const backdrop = ctx.createLinearGradient(0, 0, 0, 560);
    backdrop.addColorStop(0, '#111b29'); backdrop.addColorStop(1, '#070c13');
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, 1000, 560);
    ctx.strokeStyle = '#33425855'; ctx.lineWidth = 1;
    for (let x = 0; x <= 1000; x += 100) { ctx.beginPath(); ctx.moveTo(500 + (x - 500) * .55, 350); ctx.lineTo(x, 560); ctx.stroke(); }
    for (const y of [350, 380, 425, 485, 555]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1000, y); ctx.stroke(); }
    ctx.fillStyle = '#61738c'; ctx.font = '11px ui-monospace, monospace'; ctx.fillText('CONTROLLER STUDIO / PRACTICE BAY 01', 30, 35);
    ctx.textAlign = 'right'; ctx.fillText(TargetPractice.weapons[this.game.weapon].label.toUpperCase(), 970, 35); ctx.textAlign = 'left';
    for (const target of this.game.targets) {
      if (target.respawnAt !== null) continue;
      const { x, y } = this.game.position(target);
      ctx.strokeStyle = '#45587566'; ctx.beginPath(); ctx.moveTo(x, y + target.radius); ctx.lineTo(x, 500); ctx.stroke();
      ctx.shadowColor = '#79adff'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#182e49'; ctx.strokeStyle = '#9fc8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, target.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#82a5cf'; ctx.beginPath(); ctx.arc(x, y, target.radius * .65, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f6db91'; ctx.beginPath(); ctx.arc(x, y, target.radius * .28, 0, Math.PI * 2); ctx.fill();
    }
    for (const impact of this.impacts) {
      const age = this.game.elapsed - impact.at;
      ctx.globalAlpha = Math.max(0, 1 - age / .4); ctx.strokeStyle = impact.hit ? '#f9dd93' : '#e68d88'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(impact.x, impact.y, 8 + age * 70 + (impact.weapon === 'shotgun' ? 25 : 0), 0, Math.PI * 2); ctx.stroke();
      if (impact.hit) { ctx.fillStyle = '#ffe7a9'; ctx.font = 'bold 18px system-ui'; ctx.fillText('+' + impact.points, impact.x + 18, impact.y - 15 - age * 40); }
    }
    ctx.globalAlpha = 1;
    if (this.game.state === 'playing') {
      const { x, y } = this.game.aim; const radius = this.game.weapon === 'shotgun' ? 30 : 11;
      ctx.strokeStyle = '#fff2cc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { ctx.beginPath(); ctx.moveTo(x + dx * (radius + 4), y + dy * (radius + 4)); ctx.lineTo(x + dx * (radius + 12), y + dy * (radius + 12)); ctx.stroke(); }
      ctx.fillStyle = '#fff2cc'; ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}
