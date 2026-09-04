import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

export class DualSenseView {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.controls = new Map();
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
    this.touchMarker = new THREE.Mesh(new THREE.RingGeometry(.065, .08, 40), new THREE.MeshBasicMaterial({ color: 0xa7c8ff, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide }));
    this.touchMarker.visible = false;
    this.model.add(this.touchMarker);
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
    }
    const required = ['triangle','circle','cross','square','up','down','left','right','l1','r1','l2','r2','left-stick','right-stick','touchpad','ps','mute','create','options'];
    const missing = required.filter(id => !this.controls.has(id));
    if (missing.length) throw new Error('Controller model is missing parts: ' + missing.join(', '));
    for (const id of ['triangle','circle','cross','square','up','down','left','right']) this.addSymbol(id);
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
    for (const material of this.shellMaterials) material.color.set(palette.shell);
    for (const material of this.buttonMaterials) material.color.set(palette.button);
    for (const material of this.symbolMaterials) material.color.set(palette.symbol);
  }

  setView(view) {
    this.pose = view === 'front' ? { x: 0, y: 0, z: 0 } : view === 'back' ? { x: .06, y: Math.PI, z: 0 } : { x: .20, y: -.50, z: -.045 };
    this.zoom = 1; this.resize();
  }

  hit(clientX, clientY) {
    if (!this.ready) return null;
    const box = this.canvas.getBoundingClientRect();
    this.cursor.set((clientX - box.left) / box.width * 2 - 1, -(clientY - box.top) / box.height * 2 + 1);
    this.model.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const hit = this.raycaster.intersectObject(this.model, true).find(item => item.object !== this.touchMarker);
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

  touch(point) {
    if (!point) return;
    this.touchMarker.position.copy(point); this.touchMarker.position.z += .009;
  }

  projected(id) {
    const group = this.controls.get(id);
    if (!group) return null;
    const position = this.model.localToWorld(group.userData.surface.clone()).project(this.camera);
    return { x: (position.x + 1) / 2 * this.canvas.clientWidth, y: (1 - position.y) / 2 * this.canvas.clientHeight };
  }

  animate(time) {
    this.frame = requestAnimationFrame(next => this.animate(next));
    if (document.hidden || this.contextLost) return;
    const dt = Math.min((time - (this.previousTime || time)) / 1000, .05);
    this.previousTime = time;
    const blend = this.reducedMotion.matches ? 1 : 1 - Math.exp(-18 * dt);
    this.model.rotation.x += (this.pose.x - this.model.rotation.x) * blend;
    this.model.rotation.y += (this.pose.y - this.model.rotation.y) * blend;
    this.model.rotation.z += (this.pose.z - this.model.rotation.z) * blend;
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
      if (id === 'mute') {
        for (const child of group.children) { child.material.emissive.set(this.muted ? '#dc6615' : '#000000'); child.material.emissiveIntensity = this.muted ? .7 : 0; }
      }
    }
    for (const material of this.lightMaterials) material.emissiveIntensity = this.lights ? .7 : 0;
    this.touchMarker.visible = this.input.button('touchpad') > 0;
    this.renderer.render(this.scene, this.camera);
    this.onRender?.();
  }

  dispose() {
    cancelAnimationFrame(this.frame); this.resizeObserver.disconnect();
    this.scene.traverse(object => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
    this.environment.dispose(); this.renderer.dispose();
  }
}
