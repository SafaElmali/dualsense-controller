import { TouchDrawing } from './touch-drawing.js';
import { CanvasDownload } from './canvas-download.js';

export class TouchDrawingView {
  constructor({ onOpen, onClose, onConnect }) {
    this.model = new TouchDrawing(); this.onOpen = onOpen; this.onClose = onClose;
    this.dialog = document.getElementById('drawing');
    this.canvas = document.getElementById('drawing-canvas');
    this.pointerContacts = new Map();
    this.$('drawing-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => { this.end(); this.onClose(); });
    this.$('drawing-clear').addEventListener('click', () => { this.end(); this.model.clear(); this.draw(); this.message('Canvas cleared.'); });
    this.$('drawing-save').addEventListener('click', async () => {
      const exported = document.createElement('canvas'); exported.width = 1200; exported.height = 735;
      this.draw(exported, true);
      try { await CanvasDownload.save(exported, 'dualsense-touchpad-art.png'); this.message('Your drawing is ready to save.'); }
      catch (error) { this.message(error.message); }
    });
    this.$('drawing-connect').disabled = !navigator.hid;
    this.$('drawing-connect').addEventListener('click', async () => {
      this.$('drawing-connect').disabled = true;
      try { await onConnect(); }
      catch (error) { this.message(error.message); }
      finally { this.$('drawing-connect').disabled = !navigator.hid; }
    });
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); this.canvas.setPointerCapture(event.pointerId); this.point(event);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.canvas.hasPointerCapture(event.pointerId)) return;
      const samples = event.getCoalescedEvents?.() || [];
      for (const sample of samples.length ? samples : [event]) this.point(sample);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.canvas.addEventListener(type, event => {
      this.pointerContacts.delete(event.pointerId);
      this.model.contacts('pointer', [...this.pointerContacts.values()], this.$('drawing-color').value);
    });
    window.addEventListener('blur', () => this.end());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.end(); });
  }
  $(id) { return document.getElementById(id); }
  get isOpen() { return this.dialog.open; }
  message(text) { this.$('drawing-status').textContent = text; }
  open() { this.onOpen(); this.dialog.showModal(); this.draw(); }
  end() {
    this.model.end('hardware'); this.model.end('pointer');
    for (const id of this.pointerContacts.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.pointerContacts.clear();
  }
  contacts(contacts) {
    if (!this.isOpen) return;
    this.model.contacts('hardware', contacts, this.$('drawing-color').value); this.scheduleDraw();
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerContacts.set(event.pointerId, { id: event.pointerId, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    this.model.contacts('pointer', [...this.pointerContacts.values()], this.$('drawing-color').value); this.scheduleDraw();
  }
  scheduleDraw() {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }
  draw(canvas = this.canvas, exporting = false) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / 1200, 0, 0, canvas.width / 1200, 0, 0);
    ctx.fillStyle = '#090e18'; ctx.fillRect(0, 0, 1200, 735);
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    for (let x = 30; x < 1200; x += 40) for (let y = 30; y < 675; y += 40) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.stroke(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of this.model.strokes) {
      ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.shadowColor = stroke.color; ctx.shadowBlur = 16; ctx.lineWidth = 4;
      ctx.beginPath();
      stroke.points.forEach((point, index) => { if (index) ctx.lineTo(point.x * 1200, point.y * 675); else ctx.moveTo(point.x * 1200, point.y * 675); });
      if (stroke.points.length === 1) { const point = stroke.points[0]; ctx.arc(point.x * 1200, point.y * 675, 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (exporting) {
      ctx.fillStyle = '#090e18'; ctx.fillRect(0, 675, 1200, 60);
      ctx.fillStyle = '#a3afc0'; ctx.font = '16px system-ui';
      ctx.fillText('TOUCHPAD STUDIO', 28, 711); ctx.textAlign = 'right';
      ctx.fillText('dualsense-controller.netlify.app', 1172, 711); ctx.textAlign = 'left';
    } else {
      this.$('drawing-save').disabled = !this.model.pointCount;
      if (this.model.pointCount >= 20000) this.message('Your canvas is full. Save your drawing, then clear it to keep creating.');
    }
  }
  dispose() { cancelAnimationFrame(this.frame); this.end(); }
}
