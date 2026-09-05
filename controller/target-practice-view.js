import { RangeRenderer } from './range-renderer.js';
import { Scorecard } from './scorecard.js';
import { TargetPractice } from './target-practice.js';

export class TargetPracticeView {
  constructor({ leaderboardClient, input, onWeapon, onEnableEffects, onStopEffects, effectsActive, onShot, onOpen, onClose, onAction = () => {} }) {
    this.leaderboardClient = leaderboardClient; this.roundRequest = 0; this.roundId = null; this.starting = false; this.submitting = false;
    this.onAction = onAction;
    this.input = input; this.onWeapon = onWeapon; this.onEnableEffects = onEnableEffects;
    this.onStopEffects = onStopEffects; this.effectsActive = effectsActive; this.onOpen = onOpen; this.onClose = onClose;
    this.dialog = document.getElementById('range');
    this.canvas = document.getElementById('range-canvas'); this.ctx = this.canvas.getContext('2d');
    this.renderer = new RangeRenderer();
    this.keys = new Set(); this.impacts = []; this.previousTime = 0; this.frame = 0; this.pointer = null;
    this.game = new TargetPractice({ onShot: shot => {
      this.impacts.push({ ...shot, at: this.game.elapsed }); onShot?.();
    } });
    this.best = 0;
    try { this.best = Number(localStorage.getItem('dualsense-range-best-20s')) || 0; } catch { /* Storage is optional. */ }
    this.$('range-weapon').replaceChildren(...Object.entries(TargetPractice.weapons).map(([key, weapon]) => new Option(weapon.label, key)));
    this.$('range-weapon').addEventListener('change', event => this.selectWeapon(event.target.value));
    this.$('range-save-card').addEventListener('click', async () => {
      const result = this.lastResult;
      try { await Scorecard.save(result); this.$('range-download-status').textContent = 'Your scorecard is ready to save.'; this.onAction('scorecard', 'exported', result); }
      catch (error) { this.$('range-download-status').textContent = error.message; this.onAction('scorecard', 'export_failed'); }
    });
    try { this.$('range-nickname').value = localStorage.getItem('dualsense-nickname') || ''; } catch { /* Optional convenience. */ }
    this.$('range-submit-form').addEventListener('submit', event => { event.preventDefault(); void this.submitScore(); });
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
      if (!this.point(event)) return;
      event.preventDefault(); this.canvas.focus();
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
    this.game.start(); this.game.stop(); this.impacts = []; this.lastResult = null; this.roundId = null;
    this.$('range-submit-status').textContent = ''; this.$('range-ranking-status').textContent = '';
    this.$('range-download-status').textContent = '';
    this.$('range-weapon').value = this.game.weapon;
    this.onWeapon(this.game.weapon);
    this.dialog.showModal(); this.dialog.scrollTop = 0; this.resize(); this.update();
    this.previousTime = 0; this.frame = requestAnimationFrame(time => this.animate(time));
  }

  close() { this.dialog.close(); }
  dispose() { if (this.isOpen) this.cleanup(); cancelAnimationFrame(this.frame); this.observer.disconnect(); }
  cleanup() { this.roundRequest++; this.starting = false; cancelAnimationFrame(this.frame); this.release(); this.game.stop(); this.onStopEffects(); this.onClose(); }
  release() {
    this.keys.clear(); this.input.releaseSource('range-key'); this.input.releaseSource('range-pointer');
    this.input.releaseAxis('right', 'keyboard');
    if (this.pointer !== null && this.canvas.hasPointerCapture(this.pointer)) this.canvas.releasePointerCapture(this.pointer);
    this.pointer = null;
  }

  async start() {
    if (this.starting || this.submitting || document.getElementById('leaderboard')?.open) return;
    this.release(); this.impacts = []; this.previousTime = 0;
    this.$('range-result').textContent = ''; this.$('range-download-status').textContent = '';
    if (this.game.state === 'paused') this.game.resume();
    else {
      const request = ++this.roundRequest;
      this.starting = true; this.roundId = null; this.lastResult = null; this.submitted = false;
      this.$('range-submit-status').textContent = ''; this.$('range-ranking-status').textContent = 'Getting your round ready…'; this.update();
      try {
        const ticket = await this.leaderboardClient.start();
        if (request === this.roundRequest) { this.roundId = ticket.roundId; this.$('range-ranking-status').textContent = 'Finish your round to submit to the leaderboard.'; }
      } catch (error) { if (request === this.roundRequest) this.$('range-ranking-status').textContent = error.message; }
      if (request !== this.roundRequest || !this.isOpen) return;
      this.starting = false;
      this.dialog.querySelector('.range-setup').open = false; this.dialog.scrollTop = 0;
      this.game.start(); this.onAction('target_practice', 'started', { mode: this.game.weapon });
      if (document.hidden || !document.hasFocus() || document.getElementById('leaderboard')?.open) { this.game.pause(); this.onStopEffects(); }
    }
    this.game.trigger(this.input.button('r2'));
    if (this.game.state === 'playing') this.canvas.focus(); this.update();
  }

  async submitScore() {
    if (this.submitting || this.submitted || !this.roundId || !this.lastResult || this.game.state !== 'finished') return;
    this.submitting = true; this.update();
    const request = this.roundRequest, nickname = this.$('range-nickname').value.trim();
    this.$('range-submit-status').textContent = 'Submitting your score…';
    try {
      const result = await this.leaderboardClient.submit(this.roundId, nickname, this.lastResult);
      if (request !== this.roundRequest) return;
      this.submitted = true;
      try { localStorage.setItem('dualsense-nickname', nickname); } catch { /* Optional convenience. */ }
      const placement = result.rank && result.rank <= 50 ? `You’re #${result.rank} on the leaderboard.` : 'Keep aiming for the top 50.';
      this.$('range-submit-status').textContent = (!result.rank ? 'Round submitted. ' : result.improved ? 'Score saved! ' : 'Your best score is already saved. ') + placement;
      this.$('range-ranking-status').textContent = '';
      this.onAction('leaderboard', 'submitted', { score: this.lastResult.score });
    } catch (error) { if (request === this.roundRequest) this.$('range-submit-status').textContent = error.message; }
    finally { this.submitting = false; this.update(); }
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
    if (!this.isOpen || document.getElementById('leaderboard')?.open || event.type !== 'button') return;
    if (event.id === 'r2') this.game.trigger(event.value);
    if (!event.value || event.before) return;
    if (event.id === 'triangle') {
      const modes = Object.keys(TargetPractice.weapons);
      this.selectWeapon(modes[(modes.indexOf(this.game.weapon) + 1) % modes.length]);
    }
    if (event.id === 'cross' && this.game.state !== 'playing' && !document.activeElement?.closest('#range-submit-form')) this.start();
  }

  key(event, pressed) {
    if (!this.isOpen || document.getElementById('leaderboard')?.open || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest?.('input,select,textarea') || (pressed && event.target.closest?.('button'))) return;
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

  motion({ pitch, yaw, dt }) {
    if (this.game.state !== 'playing') return;
    this.game.setAim(this.game.aim.x - yaw * dt * 12, this.game.aim.y - pitch * dt * 12);
  }

  point(event) {
    if (this.game.state !== 'playing') return false;
    const rect = this.canvas.getBoundingClientRect();
    const point = RangeRenderer.point(rect, event.clientX, event.clientY);
    if (!point) return false;
    this.game.setAim(point.x, point.y); return true;
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
    this.$('range-time').textContent = Math.ceil(game.remaining).toString().padStart(2, '0') + 's';
    this.$('range-time-bar').style.transform = `scaleX(${game.remaining / 20})`;
    this.dialog.dataset.state = game.state;
    this.dialog.classList.toggle('time-critical', game.state === 'playing' && game.remaining <= 5);
    this.$('range-final-score').hidden = game.state !== 'finished';
    this.$('range-final-points').textContent = game.score.toLocaleString();
    this.$('range-card-eyebrow').textContent = game.state === 'finished' ? 'SESSION COMPLETE / BAY 01' : game.state === 'paused' ? 'SESSION ON HOLD' : '20 SECONDS. JUST YOU AND THE TARGETS.';
    this.$('range-controller-start').hidden = game.state === 'finished';
    this.$('range-weapon-note').textContent = ({ shooting: 'PRECISION / SINGLE SHOT', shotgun: 'WIDE SPREAD / HEAVY IMPACT', lmg: 'SUSTAINED FIRE / HEAVY', smg: 'RAPID FIRE / LIGHT' })[game.weapon];
    this.$('range-accuracy').textContent = game.accuracy + '%';
    this.$('range-streak').textContent = game.streak;
    this.$('range-best').textContent = this.best.toLocaleString();
    this.$('range-start').disabled = this.starting || this.submitting;
    this.$('range-submit-form').hidden = game.state !== 'finished' || !this.roundId || !this.lastResult?.shots || this.starting;
    this.$('range-submit-form').dataset.submitted = String(!!this.submitted);
    this.$('range-submit').disabled = this.submitting || this.submitted;
    this.$('range-submit').textContent = this.submitted ? 'Score submitted' : this.submitting ? 'Submitting…' : 'Submit score';
    this.$('range-nickname').disabled = this.submitting || this.submitted;
    this.$('range-save-card').hidden = game.state !== 'finished';
    this.$('range-overlay').hidden = game.state === 'playing';
    this.$('range-pause').disabled = game.state !== 'playing';
    this.$('range-effects').disabled = this.connecting || this.effectsActive() || game.state === 'playing';
    this.$('range-effects').textContent = this.effectsActive() ? 'Adaptive triggers enabled' : 'Enable adaptive triggers';
    const title = game.state === 'finished' ? (game.hits ? 'Nice shooting.' : 'Round complete.') : game.state === 'paused' ? 'Take a breath.' : 'Find your focus.';
    const summary = game.state === 'finished' ? `${game.hits} ${game.hits === 1 ? 'hit' : 'hits'} / ${game.shots} ${game.shots === 1 ? 'shot' : 'shots'}  ·  ${game.accuracy}% accuracy`
      : game.state === 'paused' ? 'Your timer is paused. Resume when you’re ready.' : 'Three moving targets. Four weapons. Make every shot count.';
    this.$('range-title').textContent = title; this.$('range-summary').textContent = summary;
    this.$('range-start').textContent = this.starting ? 'Starting…' : game.state === 'paused' ? 'Resume round' : game.state === 'finished' ? 'Play again' : 'Start round';
    this.$('range-feedback').textContent = this.effectsError || (this.effectsActive() ? 'Adaptive triggers active · feel your selected weapon' : 'Play freely. To feel adaptive triggers, enable them before starting or while paused.');
  }

  animate(time) {
    if (!this.isOpen) return;
    this.frame = requestAnimationFrame(next => this.animate(next));
    const dt = this.previousTime ? (time - this.previousTime) / 1000 : 0; this.previousTime = time;
    const wasPlaying = this.game.state === 'playing';
    if (!document.hidden && document.hasFocus()) this.game.step(dt, { ...this.input.axis('right'), pressure: this.input.button('r2') });
    if (wasPlaying && this.game.state === 'finished') {
      this.lastResult = this.game.result();
      if (this.roundId) this.$('range-ranking-status').textContent = this.lastResult.shots ? '' : 'Take at least one shot in your next round to join the leaderboard.';
      this.onAction('target_practice', 'completed', this.lastResult);
      this.release(); this.onStopEffects();
      this.best = Math.max(this.best, this.game.score);
      try { localStorage.setItem('dualsense-range-best-20s', String(this.best)); } catch { /* Storage is optional. */ }
      this.$('range-result').textContent = `Round complete: ${this.game.score} points and ${this.game.accuracy}% accuracy.`;
      this.update();
      if (!this.$('range-submit-form').hidden && document.activeElement === this.canvas) this.$('range-nickname').focus({ preventScroll: true });
    }
    this.impacts = this.impacts.filter(impact => this.game.elapsed - impact.at < .6);
    this.update(); this.draw();
  }

  draw() {
    if (this.ctx && this.canvas.width) this.renderer.draw(this.ctx, this.game, this.impacts, this.canvas.width, this.canvas.height);
  }
}
