import * as THREE from 'three';

function roundedRect(width, height, radius) {
  const shape = new THREE.Shape(), x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function extrude(shape, depth, bevel = .025) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 12 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export class BatteryView {
  constructor(root) {
    this.root = root;
    this.button = root.querySelector('button');
    this.tooltip = root.querySelector('[role="tooltip"]');
    this.canvas = root.querySelector('canvas');
    this.supported = !!navigator.hid && window.isSecureContext;
    this.state = { reading: null, connected: false, transport: null };
    this.availableMessage = this.supported ? 'Connect your DualSense to read its battery. Browser permission is required.' : 'Battery readings need desktop Chrome or Edge and controller access.';
    this.update(this.state);
    try { this.createScene(); }
    catch {
      this.dispose();
      // The percentage and a CSS battery remain usable without another WebGL context.
      this.root.classList.add('battery-fallback');
    }
  }

  createScene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.65, 1.65, .88, -.88, .1, 20);
    this.camera.position.z = 6;
    this.scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3.5); light.position.set(-2, 5, 5); this.scene.add(light);
    const rim = new THREE.DirectionalLight(0x9bffe3, 2); rim.position.set(4, -2, 2); this.scene.add(rim);
    this.body = new THREE.Group(); this.body.rotation.set(.15, -.26, -.025); this.body.position.x = -.06;
    this.scene.add(this.body);
    this.frameMaterial = new THREE.MeshStandardMaterial({ color: 0x66717a, metalness: .48, roughness: .28 });
    this.fillMaterial = new THREE.MeshStandardMaterial({ color: 0x63e7b3, emissive: 0x2aa775, emissiveIntensity: .45, metalness: .18, roughness: .24 });
    const outline = roundedRect(2.25, 1.06, .22);
    outline.holes.push(new THREE.Path(roundedRect(1.92, .73, .11).getPoints(24)));
    this.body.add(new THREE.Mesh(extrude(outline, .23), this.frameMaterial));
    const cap = new THREE.Mesh(extrude(roundedRect(.16, .39, .055), .15), this.frameMaterial);
    cap.position.x = 1.22; this.body.add(cap);
    const backing = new THREE.Mesh(extrude(roundedRect(1.96, .77, .12), .06), new THREE.MeshStandardMaterial({ color: 0x14221e, roughness: .4, metalness: .15 }));
    backing.position.z = -.12; this.body.add(backing);
    this.resize = new ResizeObserver(() => {
      const { width, height } = this.canvas.getBoundingClientRect();
      if (width && height) { this.renderer.setSize(width, height, false); this.render(); }
    });
    this.resize.observe(this.canvas);
    this.updateGraphic();
  }

  update(state) {
    this.state = state;
    const { reading, connected, transport } = state, level = reading?.level;
    const status = reading?.status || (connected ? 'waiting' : 'disconnected');
    this.root.dataset.status = status;
    this.root.dataset.transport = transport || '';
    this.root.querySelector('.battery-percent').textContent = level == null ? '—%' : `${level}%`;
    this.root.querySelector('.battery-charge').toggleAttribute('hidden', status !== 'charging');
    this.root.style.setProperty('--battery-color', level == null ? '#8b929e' : level <= 15 ? '#ff8b86' : level <= 25 ? '#f0cb7e' : '#63e7b3');
    this.root.style.setProperty('--battery-fill', `${level || 0}%`);
    const message = !connected ? this.availableMessage
      : !reading ? 'Connected. Waiting for a battery report. If no reading appears, try a USB data cable.'
      : status === 'error' ? 'The controller reports a charging error. Battery level is unavailable.'
      : level == null ? 'Battery level is unavailable in this controller report.'
      : `${transport} · ${status === 'full' ? 'Fully charged' : status === 'charging' ? 'Charging' : 'On battery'}. ${level}% estimated charge. The controller reports in 10% steps.`;
    this.setNotice(message);
    this.button.setAttribute('aria-label', !connected ? 'Connect controller for battery status' : `Controller battery: ${level == null ? 'unavailable' : `${level}%`}${status === 'charging' ? ', charging' : status === 'full' ? ', fully charged' : ''}`);
    this.setBusy(false);
    this.updateGraphic();
  }

  setNotice(message) { this.tooltip.textContent = message; this.button.title = message; }
  setBusy(busy) { this.button.disabled = busy || !this.supported; this.button.setAttribute('aria-busy', String(busy)); }

  updateGraphic() {
    if (!this.renderer || !this.body) return;
    const level = this.state.reading?.level;
    const color = level == null ? 0x697481 : level <= 15 ? 0xff8b86 : level <= 25 ? 0xf0cb7e : 0x63e7b3;
    this.frameMaterial.color.setHex(color);
    this.fillMaterial.color.setHex(color); this.fillMaterial.emissive.setHex(color);
    if (this.fill) { this.body.remove(this.fill); this.fill.geometry.dispose(); this.fill = null; }
    if (level > 0) {
      const width = 1.78 * level / 100;
      this.fill = new THREE.Mesh(extrude(roundedRect(width, .59, Math.min(.09, width / 3)), .15, .015), this.fillMaterial);
      this.fill.position.set((width - 1.78) / 2, 0, .005); this.body.add(this.fill);
    }
    this.render();
  }

  render() { if (this.renderer && this.scene) this.renderer.render(this.scene, this.camera); }
  dispose() {
    this.resize?.disconnect();
    const materials = new Set();
    this.scene?.traverse(object => { object.geometry?.dispose(); if (object.material) materials.add(object.material); });
    materials.add(this.fillMaterial); materials.forEach(material => material?.dispose());
    this.renderer?.dispose(); this.renderer = null;
  }
}
