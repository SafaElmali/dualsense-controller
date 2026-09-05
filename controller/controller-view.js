import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

export class DualSenseView {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.controls = new Map();
    this.pressedColor = new THREE.Color('#f4d878');
    this.touchSources = new Map();
    this.touchMarkers = [];
    this.touchRaycaster = new THREE.Raycaster();
    this.shellMaterials = [];
    this.buttonMaterials = [];
    this.symbolMaterials = [];
    this.lightMaterials = [];
    this.pose = { x: .08, y: -.12, z: -.018 };
    this.zoom = 1;
    this.lights = true;
    this.muted = false;
    this.hover = null;
    this.ready = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x111215, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .88;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
    this.camera.position.set(0, 0, 9);
    this.raycaster = new THREE.Raycaster();
    this.cursor = new THREE.Vector2();
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.scene.add(new THREE.HemisphereLight(0xf1f4ff, 0x282c3a, .65));
    const key = new THREE.DirectionalLight(0xfff9f0, 2.3);
    key.position.set(-3, 5, 7); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -5; key.shadow.camera.right = 5;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
    key.shadow.normalBias = .012; key.shadow.bias = -.00015;
    key.shadow.radius = 6; key.shadow.blurSamples = 8;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7e1ff, .8); fill.position.set(5, 1, 4); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd4e0ff, 2.2); rim.position.set(1, 4, -4); this.scene.add(rim);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, .035);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .62;
    environment.dispose(); pmrem.dispose();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.previousTime = 0;
    this.frame = requestAnimationFrame(time => this.animate(time));
  }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('./controller/dualsense.glb', event => {
      if (event.total) onProgress?.(Math.round(event.loaded / event.total * 100));
    });
    gltf.scene.updateMatrixWorld(true);
    const meshes = [];
    gltf.scene.traverse(object => { if (object.isMesh) meshes.push(object); });
    for (const object of meshes) {
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      let material = object.material.clone();
      if (material.name === 'Material.002') {
        material = new THREE.MeshPhysicalMaterial({ name: 'Material.002', color: '#d0d4de', roughness: .23, metalness: 0, clearcoat: .8, clearcoatRoughness: .12 });
      }
      if (material.map) material.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      const darkDetail = /^(ps-mount|mute-mount|white-shell-detail)/.test(object.name);
      if (['front_body', 'VRayMtl55'].includes(material.name) && !darkDetail) {
        material.metalness = .015;
        material.roughness = material.name === 'front_body' ? .43 : .55;
        material.color.set('#e9eaf0');
        this.shellMaterials.push(material);
      }
      if (darkDetail) { material.color.set('#16171c'); material.roughness = .55; material.metalness = 0; }
      if (['Material.002', 'Material.009', 'Material.007'].includes(material.name)) this.buttonMaterials.push(material);
      if (material.name === 'VRayMtl33') { material.metalness = 0; material.roughness = .78; material.color.set('#24252b'); }
      if (material.name === 'front_body.002') { material.metalness = 0; material.roughness = .7; material.color.set('#191a20'); }
      if (material.name === 'front_body.001') { material.metalness = 0; material.roughness = .46; material.color.set('#15161b'); }
      if (object.userData.control === 'ps') { material.color.set('#141519'); material.metalness = .15; material.roughness = .3; }
      if (material.name === 'VRayMtl37') { material.metalness = 0; material.roughness = .48; material.color.set('#202127'); }
      if (material.name === 'Material.008') {
        material.color.set('#0031c9'); material.emissive.set('#0046ff'); material.emissiveIntensity = .7;
        material.toneMapped = false;
        this.lightMaterials.push(material);
      }
      if (material.name === 'Material.010') {
        material.color.set('#17191f'); material.emissive.set('#000000'); material.emissiveIntensity = 0;
      }
      if (material.transparent) { material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -1; }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = object.name;
      mesh.userData = { ...object.userData };
      mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
      const id = object.userData.control;
      if (id && id !== 'lights') {
        if (!this.controls.has(id)) {
          const group = new THREE.Group(); group.name = id; group.userData.control = id;
          this.controls.set(id, group); this.model.add(group);
        }
        this.controls.get(id).add(mesh);
      } else this.model.add(mesh);
    }
    // Geometry is baked into the model's shared coordinates. Center each moving
    // assembly once so rotations occur around a physical pivot, not the origin.
    for (const [id, group] of this.controls) {
      const bounds = new THREE.Box3().setFromObject(group);
      const pivot = bounds.getCenter(new THREE.Vector3());
      if (id.endsWith('-stick')) pivot.z = .74;
      if (['l2', 'r2'].includes(id)) { pivot.y = bounds.max.y - .10; pivot.z = bounds.max.z - .10; }
      for (const child of group.children) child.geometry.translate(-pivot.x, -pivot.y, -pivot.z);
      group.position.copy(pivot);
      group.userData.rest = pivot.clone();
      group.userData.surface = new THREE.Vector3(pivot.x, bounds.getCenter(new THREE.Vector3()).y, bounds.max.z);
      if (id === 'l2' || id === 'r2') group.userData.surface.z = bounds.min.z;
      if (id === 'touchpad') group.userData.touchBounds = bounds.clone().translate(pivot.clone().negate());
    }
    const required = ['triangle','circle','cross','square','up','down','left','right','l1','r1','l2','r2','left-stick','right-stick','touchpad','ps','mute','create','options'];
    const missing = required.filter(id => !this.controls.has(id));
    if (missing.length) throw new Error('Controller model is missing parts: ' + missing.join(', '));
    for (const id of ['triangle','circle','cross','square','up','down','left','right']) this.addSymbol(id);
    for (const group of this.controls.values()) {
      for (const child of group.children) {
        child.userData.restEmissive = child.material.emissive.clone();
        child.userData.restEmissiveIntensity = child.material.emissiveIntensity;
        child.material.userData.restColor = child.material.color.clone();
      }
    }
    const touchpad = this.controls.get('touchpad');
    this.touchSurfaces = [...touchpad.children];
    for (let i = 0; i < 2; i++) {
      const marker = new THREE.Mesh(new THREE.RingGeometry(.065, .085, 48), new THREE.MeshBasicMaterial({ color: '#d7a83d', transparent: true, opacity: .95, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
      marker.raycast = () => {}; marker.visible = false;
      touchpad.add(marker); this.touchMarkers.push(marker);
    }
    this.model.rotation.set(this.pose.x, this.pose.y, this.pose.z);
    this.ready = true;
    this.resize();
    return this;
  }

  addSymbol(id) {
    const group = this.controls.get(id);
    const cap = group.children.find(mesh => mesh.material.name === 'Material.002');
    if (!cap) return;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (id === 'triangle') { ctx.moveTo(128,35); ctx.lineTo(230,213); ctx.lineTo(26,213); ctx.closePath(); ctx.stroke(); }
    if (id === 'circle') { ctx.arc(128,128,92,0,Math.PI*2); ctx.stroke(); }
    if (id === 'square') ctx.strokeRect(43,43,170,170);
    if (id === 'cross') { ctx.moveTo(48,48); ctx.lineTo(208,208); ctx.moveTo(208,48); ctx.lineTo(48,208); ctx.stroke(); }
    const arrow = ['up','down','left','right'].includes(id);
    if (arrow) {
      ctx.translate(128,128); ctx.rotate({up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2}[id]);
      ctx.moveTo(0,-62); ctx.lineTo(65,40); ctx.lineTo(-65,40); ctx.closePath(); ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ color: '#7c8597', map: texture, transparent: true, depthWrite: false, roughness: .55, polygonOffset: true, polygonOffsetFactor: -4 });
    this.symbolMaterials.push(material);
    cap.updateWorldMatrix(true, false);
    cap.geometry.computeBoundingBox();
    const bounds = cap.geometry.boundingBox;
    const center = bounds.getCenter(new THREE.Vector3());
    center.z = bounds.max.z;
    if (arrow) {
      center.x += {left:-.045,right:.045,up:0,down:0}[id];
      center.y += {up:.045,down:-.045,left:0,right:0}[id];
    }
    cap.localToWorld(center);
    const size = arrow ? .11 : .235;
    const orientation = new THREE.Euler().setFromQuaternion(cap.getWorldQuaternion(new THREE.Quaternion()));
    const decal = new THREE.Mesh(new DecalGeometry(cap, center, orientation, new THREE.Vector3(size,size,.3)), material);
    decal.geometry.applyMatrix4(group.matrixWorld.clone().invert());
    decal.userData.control = id; decal.name = id + '-symbol'; group.add(decal);
  }

  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const verticalSpace = Math.max(3.65, 5.95 / this.camera.aspect);
    this.camera.position.z = verticalSpace / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) + .8;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
  }

  setFinish(finish) {
    const finishes = {
      white: { shell: '#e9eaf0', button: '#d0d4de', symbol: '#7c8597' },
      black: { shell: '#34343c', button: '#363740', symbol: '#969dad' },
      red: { shell: '#9e304b', button: '#5c2e42', symbol: '#c090a6' },
    };
    const palette = finishes[finish] || finishes.white;
    for (const [materials, color] of [[this.shellMaterials, palette.shell], [this.buttonMaterials, palette.button], [this.symbolMaterials, palette.symbol]]) {
      for (const material of materials) {
        material.color.set(color);
        if (material.userData.restColor) material.userData.restColor.copy(material.color);
      }
    }
  }

  setView(view, { resetZoom = true } = {}) {
    const poses = {
      front: { x: 0, y: 0, z: 0 }, back: { x: .06, y: Math.PI, z: 0 },
      angle: { x: .20, y: -.50, z: -.045 },
      triggers: { x: .75, y: Math.PI, z: 0 }, shoulders: { x: 1.05, y: 0, z: 0 },
    };
    this.pose = { ...(poses[view] || poses.front) };
    if (resetZoom) { this.zoom = 1; this.resize(); }
  }

  motion({ pitch, yaw, roll, dt }) {
    const radians = Math.PI / 180 * dt;
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pose.x, this.pose.y, this.pose.z));
    orientation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * radians, -yaw * radians, -roll * radians)));
    const euler = new THREE.Euler().setFromQuaternion(orientation);
    this.pose = { x: euler.x, y: euler.y, z: euler.z };
  }

  hit(clientX, clientY) {
    if (!this.ready) return null;
    const box = this.canvas.getBoundingClientRect();
    this.cursor.set((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1);
    this.model.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const hit = this.raycaster.intersectObject(this.model, true)[0];
    if (!hit) return null;
    return { id: hit.object.userData.control || hit.object.parent.userData.control || null, point: this.model.worldToLocal(hit.point.clone()) };
  }

  stickPoint(clientX, clientY, side) {
    const group = this.controls.get(side + '-stick');
    if (!group) return null;
    const box = this.canvas.getBoundingClientRect();
    this.cursor.set((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1);
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const localRay = this.raycaster.ray.clone().applyMatrix4(this.model.matrixWorld.clone().invert());
    return localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -group.userData.surface.z), new THREE.Vector3());
  }

  setTouchContacts(source, contacts) {
    if (contacts.length) this.touchSources.set(source, contacts);
    else this.touchSources.delete(source);
  }

  touch(point) {
    const group = this.controls.get('touchpad');
    if (!point || !group) { this.setTouchContacts('pointer', []); return; }
    const local = point.clone().sub(group.userData.rest);
    const bounds = group.userData.touchBounds;
    this.setTouchContacts('pointer', [{ x: THREE.MathUtils.clamp((local.x - bounds.min.x) / (bounds.max.x - bounds.min.x), 0, 1), y: THREE.MathUtils.clamp((bounds.max.y - local.y) / (bounds.max.y - bounds.min.y), 0, 1) }]);
  }

  renderTouches() {
    const group = this.controls.get('touchpad');
    if (!group) return;
    const contacts = this.touchSources.get('pointer') || this.touchSources.get('hardware') || (this.input.button('touchpad') ? [{ x: .5, y: .5 }] : []);
    const bounds = group.userData.touchBounds;
    group.updateWorldMatrix(true, true);
    this.touchMarkers.forEach((marker, index) => {
      const contact = contacts[index]; marker.visible = !!contact;
      if (!contact) return;
      // Raycast onto the actual curved pad rather than a floating rectangle.
      const origin = new THREE.Vector3(THREE.MathUtils.lerp(bounds.min.x + .09, bounds.max.x - .09, contact.x), THREE.MathUtils.lerp(bounds.max.y - .09, bounds.min.y + .09, contact.y), bounds.max.z + 1);
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
      this.touchRaycaster.set(group.localToWorld(origin), direction);
      const hit = this.touchRaycaster.intersectObjects(this.touchSurfaces, false)[0];
      marker.visible = !!hit;
      if (hit) {
        marker.position.copy(group.worldToLocal(hit.point)).addScaledVector(hit.face.normal, .012);
        marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.face.normal);
      }
    });
  }

  projected(id) {
    const group = this.controls.get(id);
    if (!group) return null;
    const position = group.localToWorld(group.userData.surface.clone().sub(group.userData.rest)).project(this.camera);
    return { x: (position.x + 1) / 2 * this.canvas.clientWidth, y: (1 - position.y) / 2 * this.canvas.clientHeight };
  }

  animate(time) {
    this.frame = requestAnimationFrame(next => this.animate(next));
    if (document.hidden || this.contextLost || this.suspended) return;
    const dt = Math.min((time - (this.previousTime || time)) / 1000, .05);
    this.previousTime = time;
    const blend = this.reducedMotion.matches ? 1 : 1 - Math.exp(-18 * dt);
    const cameraBlend = this.reducedMotion.matches ? 1 : 1 - Math.exp(-8 * dt);
    const targetOrientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pose.x, this.pose.y, this.pose.z));
    this.model.quaternion.slerp(targetOrientation, cameraBlend);
    for (const [id, group] of this.controls) {
      const rest = group.userData.rest;
      if (!rest) continue;
      if (id.endsWith('-stick')) {
        const side = id.startsWith('left') ? 'left' : 'right';
        const axis = this.input.axis(side);
        group.rotation.x += (axis.y * .29 - group.rotation.x) * blend;
        group.rotation.y += (axis.x * .29 - group.rotation.y) * blend;
        const targetZ = rest.z - this.input.button(side === 'left' ? 'l3' : 'r3') * .035;
        group.position.z += (targetZ - group.position.z) * blend;
      } else if (id === 'l2' || id === 'r2') {
        group.rotation.x += (-this.input.button(id) * .21 - group.rotation.x) * blend;

      } else {
        const travel = id === 'touchpad' ? .016 : ['l1', 'r1'].includes(id) ? .025 : .032;
        group.position.z += (rest.z - this.input.button(id) * travel - group.position.z) * blend;
      }
      const buttonId = id === 'left-stick' ? 'l3' : id === 'right-stick' ? 'r3' : id;
      const pressed = this.input.button(buttonId) > .05 || (id === 'touchpad' && this.touchSources.size > 0);
      group.userData.glow = THREE.MathUtils.lerp(group.userData.glow || 0, pressed ? 1 : 0, blend);
      for (const child of group.children) {
        if (!child.userData.restEmissive) continue;
        const glow = child.name.endsWith('-symbol') ? 0 : group.userData.glow;
        const muted = id === 'mute' && this.muted;
        child.material.color.copy(child.material.userData.restColor).lerp(this.pressedColor, glow * .4);
        child.material.emissive.copy(child.userData.restEmissive);
        if (muted) child.material.emissive.set('#dc6615');
        child.material.emissive.lerp(this.pressedColor, glow);
        child.material.emissiveIntensity = THREE.MathUtils.lerp(muted ? .7 : child.userData.restEmissiveIntensity, .35, glow);
      }
    }
    for (const material of this.lightMaterials) material.emissiveIntensity = this.lights ? .7 : 0;
    this.renderTouches();
    this.renderer.render(this.scene, this.camera);
    this.onRender?.();
  }

  dispose() {
    cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    this.scene.traverse(object => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
    this.environment.dispose(); this.renderer.dispose();
  }
}
