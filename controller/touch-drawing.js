export class TouchDrawing {
  constructor() { this.clear(); }
  clear() { this.strokes = []; this.active = new Map(); }
  get pointCount() { return this.strokes.reduce((count, stroke) => count + stroke.points.length, 0); }
  end(source) { for (const key of this.active.keys()) if (key.startsWith(source + ':')) this.active.delete(key); }

  contacts(source, contacts, color = '#f4d878') {
    const keys = new Set();
    for (const contact of contacts) {
      if (!Number.isFinite(contact.x) || !Number.isFinite(contact.y)) continue;
      const key = source + ':' + contact.id; keys.add(key);
      const point = { x: Math.max(0, Math.min(1, contact.x)), y: Math.max(0, Math.min(1, contact.y)) };
      let stroke = this.active.get(key);
      if (!stroke || stroke.color !== color) {
        if (this.pointCount >= 20000) continue;
        stroke = { color, points: [point] }; this.strokes.push(stroke); this.active.set(key, stroke);
      } else {
        const previous = stroke.points.at(-1);
        if (Math.hypot(previous.x - point.x, previous.y - point.y) >= .002 && this.pointCount < 20000) { stroke.points.push(point); }
      }
    }
    for (const key of this.active.keys()) if (key.startsWith(source + ':') && !keys.has(key)) this.active.delete(key);
  }
}
