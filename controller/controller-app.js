import { AdaptiveTriggers } from './adaptive-triggers.js';
import { analytics } from './analytics.js';
import { ControllerInput } from './input-state.js';
import { InputCamera } from './input-camera.js';
import { GyroInput } from './gyro-input.js';
import { BatteryInput } from './battery-input.js';
import { BatteryView } from './battery-view.js';
import { AppearanceView } from './appearance-view.js';
import { TouchpadInput } from './touchpad-input.js';
import { DualSenseView } from './controller-view.js';
import { TouchDrawingView } from './touch-drawing-view.js';
import { DiagnosticsView } from './diagnostics-view.js';
import { LeaderboardClient, LeaderboardView } from './leaderboard.js';
import { TargetPracticeView } from './target-practice-view.js';

const $ = id => document.getElementById(id);
const canvas = $('controller-canvas');
const help = $('help');
const labels = { triangle:'Triangle', circle:'Circle', cross:'Cross', square:'Square', up:'D-pad up', down:'D-pad down', left:'D-pad left', right:'D-pad right', l1:'L1', r1:'R1', l2:'L2', r2:'R2', l3:'L3', r3:'R3', ps:'Home', mute:'Microphone mute', touchpad:'Touchpad', create:'Create', options:'Options' };
const keyMap = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', Digit4:'triangle', Digit2:'circle', KeyX:'cross', KeyZ:'square', KeyQ:'l1', KeyE:'r1', Digit1:'l2', Digit3:'r2', KeyF:'l3', KeyH:'r3', Space:'ps', KeyM:'mute', KeyT:'touchpad', KeyC:'create', Escape:'options' };
const stickKeys = { left:['KeyA','KeyD','KeyW','KeyS'], right:['KeyJ','KeyL','KeyI','KeyK'] };
const analogCodes = new Set(Object.values(stickKeys).flat());
const heldKeys = new Set();
const pointers = new Map();
const accessibleButtons = new Map();
const timers = new Set();
let view, range, drawing, diagnostics, leaderboard, audio, sound = false, statusTimer, gamepadIndex = null, gamepadFrame = 0;
const inputCamera = new InputCamera(angle => {
  // Keep a dragged control under the pointer until the gesture ends.
  if (!view?.ready || pointers.size || gyro.enabled) return;
  view.setView(angle, { resetZoom: false });
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
});
function setAutoView(enabled) {
  inputCamera.setEnabled(enabled);
  $('auto-view').setAttribute('aria-pressed', String(enabled));
}
$('auto-view').addEventListener('click', () => setAutoView(!inputCamera.enabled));

const leaderboardClient = new LeaderboardClient();
const triggerStatus = $('trigger-effect-status');
let triggerBusy = false, sensorNoticeTimer;
let lightColorTimer;
const appearance = new AppearanceView({
  onColor: (kind, color) => {
    if (kind === 'light') {
      view?.setLightColor(color);
      if (triggers.lightColor !== null) {
        clearTimeout(lightColorTimer);
        lightColorTimer = setTimeout(() => { if (triggers.lightColor !== null) void syncLightColor(); }, 80);
      }
    } else {
      view?.setBodyColor(color);
      document.querySelectorAll('[data-finish]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      $('finish-label').textContent = 'Custom';
    }
  },
  onAction: (kind, action) => analytics.featureAction('appearance', action, { target: kind }),
});
function renderLightSync() {
  const syncing = triggers.lightColor !== null;
  $('sync-light').disabled = triggerBusy || !!range?.connecting || !navigator.hid || !window.isSecureContext;
  $('sync-light').setAttribute('aria-pressed', String(syncing));
  $('sync-light').textContent = syncing ? 'Stop light sync' : 'Sync controller light ↗';
}
async function syncLightColor() {
  try {
    if (await triggers.setLightColor(appearance.input('light').value)) $('light-sync-status').textContent = 'Light synced. New colors update your controller too.';
  } catch (error) { $('light-sync-status').textContent = error.message; }
  renderLightSync();
}
$('sync-light').addEventListener('click', async () => {
  if (triggerBusy || range?.connecting) return;
  clearTimeout(lightColorTimer);
  if (triggers.lightColor !== null) {
    triggers.stopLightSync(); renderLightSync();
    $('light-sync-status').textContent = 'Sync off. Your controller keeps its last color.';
    analytics.featureAction('appearance', 'sync_disabled'); return;
  }
  triggerBusy = true; renderGyro(); renderTouchpad(); $('enable-triggers').disabled = true;
  try {
    await triggers.connect({ enableEffects: false });
    if (triggers.device) {
      await syncLightColor();
      if (triggers.lightColor !== null) analytics.featureAction('appearance', 'sync_enabled');
    } else $('light-sync-status').textContent = 'No controller selected. Click Sync to try again.';
  } catch (error) { $('light-sync-status').textContent = error.name === 'NotAllowedError' ? 'Controller access was not granted. Click Sync to try again.' : error.message; }
  finally { triggerBusy = false; renderGyro(); renderTouchpad(); $('enable-triggers').disabled = triggers.active || !navigator.hid; }
});
window.addEventListener('pagehide', () => { clearTimeout(lightColorTimer); triggers.stopLightSync(); appearance.dispose(); });
const batteryView = new BatteryView($('battery-tool'));
const battery = new BatteryInput(reading => {
  batteryView.update({ reading, connected: !!battery.device, transport: battery.device ? triggers.transport?.name : null });
  renderBattery();
  if (reading?.level != null) analytics.once('controller_battery_reading_available');
});
function renderBattery() { batteryView.setBusy(triggerBusy || !!range?.connecting); }
$('battery-connect').addEventListener('click', async () => {
  if (triggerBusy || range?.connecting) return;
  $('battery-tool').classList.remove('battery-details-dismissed');
  if (battery.device) { $('battery-tool').classList.add('battery-details-open'); return; }
  triggerBusy = true; renderBattery(); renderTouchpad(); renderGyro(); $('enable-triggers').disabled = true;
  analytics.featureAction('battery', 'connect_requested');
  try {
    await triggers.connect({ enableEffects: false });
    if (!triggers.device) batteryView.setNotice('No controller selected. Click the battery to try again.');
  } catch (error) {
    batteryView.setNotice(error.name === 'NotAllowedError' ? 'Controller access was not granted. Click the battery to try again.' : error.message);
  } finally {
    triggerBusy = false; renderBattery(); renderTouchpad(); renderGyro();
    $('enable-triggers').disabled = triggers.active || !navigator.hid;
    $('battery-tool').classList.add('battery-details-open');
  }
});
function dismissBatteryDetails() { $('battery-tool').classList.remove('battery-details-open'); $('battery-tool').classList.add('battery-details-dismissed'); }
document.addEventListener('pointerdown', event => { if (!$('battery-tool').contains(event.target)) dismissBatteryDetails(); });
$('battery-connect').addEventListener('keydown', event => { if (event.key === 'Escape') dismissBatteryDetails(); });
for (const event of ['pointerenter', 'focusin']) $('battery-tool').addEventListener(event, () => $('battery-tool').classList.remove('battery-details-dismissed'));
window.addEventListener('pagehide', () => { battery.attach(null); batteryView.dispose(); });
function sensorStatus(feature, message) {
  const node = $(feature + '-status'), changed = node.textContent !== message;
  node.textContent = message;
  if (feature === 'gyro') $('range-gyro-status').textContent = message;
  if (changed) {
    clearTimeout(sensorNoticeTimer); $('sensor-notice').textContent = message; $('sensor-notice').hidden = false;
    sensorNoticeTimer = setTimeout(() => { $('sensor-notice').hidden = true; }, 6500);
  }
}
function renderSensorToggle(id, feature, active) {
  const button = $(id), action = (active ? 'Disable ' : 'Enable ') + feature;
  button.setAttribute('aria-pressed', String(active)); button.setAttribute('aria-label', action); button.title = action;
  $(feature + '-action').textContent = action;
}
function renderTouchpad() {
  renderSensorToggle('enable-touchpad', 'touchpad', !!touchpad.device && touchpad.enabled);
  $('enable-touchpad').disabled = triggerBusy || !navigator.hid || !window.isSecureContext;
}
const touchpad = new TouchpadInput(contacts => {
  view?.setTouchContacts('hardware', contacts);
  drawing?.contacts(contacts);
  inputCamera.observe({ type: 'button', id: 'touch-contact', value: contacts.length ? 1 : 0 });
}, (connected, message) => {
  sensorStatus('touchpad', message);
  if (drawing?.isOpen) drawing.message(message);
  renderTouchpad();
});
let gyroUiTime = 0;
const gyro = new GyroInput(motion => {
  const { pitch, yaw, roll, dt } = motion;
  if (document.hidden || !document.hasFocus() || help.open || drawing?.isOpen || diagnostics?.isOpen || leaderboard?.isOpen) { pauseGyro(); return; }
  if (range?.isOpen) range.motion({ pitch, yaw, dt });
  else if (view?.ready && !pointers.size) view.motion(motion);
  if (performance.now() - gyroUiTime > 100) {
    gyroUiTime = performance.now(); $('gyro-values').textContent = `Pitch ${pitch.toFixed(1)}°/s · Yaw ${yaw.toFixed(1)}°/s · Roll ${roll.toFixed(1)}°/s${gyro.scale ? '' : ' (approx.)'}`;
  }
}, message => sensorStatus('gyro', message));
function renderGyro() {
  renderBattery();
  renderLightSync();
  view?.setGyroEnabled(gyro.enabled);
  $('auto-view').disabled = gyro.enabled || !view?.ready;
  $('auto-view').title = gyro.enabled ? 'Turn gyro off to follow button presses' : 'Follow the controls you use';
  for (const id of ['recenter-gyro', 'range-recenter-gyro']) $(id).disabled = !gyro.enabled;
  $('enable-gyro').disabled = triggerBusy || !navigator.hid || !window.isSecureContext;
  renderSensorToggle('enable-gyro', 'gyro', gyro.enabled);
  $('range-gyro').disabled = triggerBusy || !!range?.connecting || !navigator.hid || !window.isSecureContext;
  $('range-gyro').textContent = gyro.enabled ? 'Disable gyro aiming' : 'Enable gyro aiming';
}
function pauseGyro() { gyro.setPaused(document.hidden || !document.hasFocus() || help.open || !!drawing?.isOpen || !!diagnostics?.isOpen || !!leaderboard?.isOpen); }
async function enableGyro() {
  if (triggerBusy || range?.connecting) return;
  triggerBusy = true; renderGyro();
  try {
    await triggers.connect({ enableEffects: false });
    if (await gyro.enable()) { pauseGyro(); analytics.featureAction('gyro', 'enabled'); }
    else if (!triggers.device) sensorStatus('gyro', 'No controller selected. Click the gyro icon to try again.');
  } catch (error) { sensorStatus('gyro', error.name === 'NotAllowedError' ? 'Controller access was not granted. Click the gyro icon to try again.' : error.message); }
  finally { triggerBusy = false; renderGyro(); $('enable-triggers').disabled = triggers.active || !navigator.hid; renderTouchpad(); }
}
function disableGyro() { gyro.setEnabled(false); renderGyro(); sensorStatus('gyro', 'Gyro off. Stick and mouse controls still work.'); analytics.featureAction('gyro', 'disabled'); }
function recenterGyro() {
  range?.pause();
  if (gyro.recenter()) { if (range?.isOpen) range.game.setAim(500, 280); analytics.featureAction('gyro', 'recentered'); }
}
$('enable-gyro').addEventListener('click', () => gyro.enabled ? disableGyro() : enableGyro());
$('range-gyro').addEventListener('click', () => gyro.enabled ? disableGyro() : enableGyro());
for (const id of ['recenter-gyro', 'range-recenter-gyro']) $(id).addEventListener('click', recenterGyro);
for (const event of ['blur', 'focus']) window.addEventListener(event, pauseGyro);
document.addEventListener('visibilitychange', pauseGyro);
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', pauseGyro);
const gyroWatch = setInterval(() => {
  pauseGyro(); renderGyro();
  if (gyro.enabled && !gyro.paused && performance.now() - gyro.lastReport > 3000) {
    gyro.previous = null; gyro.measurement = null; gyro.received = false;
    sensorStatus('gyro', 'No motion reports received. Try a USB data cable, or reconnect your controller.');
  }
}, 1000);
window.addEventListener('pagehide', () => { clearInterval(gyroWatch); gyro.attach(null); clearTimeout(sensorNoticeTimer); });
const triggers = new AdaptiveTriggers(navigator.hid, state => {
  battery.attach(state.device);
  gyro.attach(state.device); renderGyro();
  void touchpad.attach(state.device, triggers.transport?.name === 'Bluetooth');
  triggerStatus.textContent = state.message;
  $('disable-triggers').disabled = !state.connected;
  $('enable-triggers').textContent = state.active ? 'Trigger effects enabled' : 'Enable trigger effects';
  $('enable-triggers').disabled = triggerBusy || state.active || !navigator.hid;
  if (!state.connected) $('light-sync-status').textContent = 'Connect your DualSense to sync its light.';
});
if (!navigator.hid || !window.isSecureContext) {
  $('light-sync-status').textContent = 'Physical light sync needs desktop Chrome or Edge. You can still style the 3D controller.';
  renderGyro(); sensorStatus('gyro', 'Use desktop Chrome or Edge to enable physical gyro input.');
  $('enable-triggers').disabled = true;
  $('enable-touchpad').disabled = true;
  sensorStatus('touchpad', 'Use desktop Chrome or Edge for physical finger tracking. Drag the on-screen touchpad to try the circle here.');
  triggerStatus.textContent = 'Open this site in desktop Chrome or Edge to feel real trigger resistance.';
}
function stopTriggers() {
  void triggers.pause().catch(error => { triggerStatus.textContent = error.message; });
}
const triggerMode = $('trigger-mode');
triggerMode.replaceChildren(...Object.entries(AdaptiveTriggers.presets).map(([mode, preset]) => new Option(preset.label, mode)));
triggerMode.value = triggers.mode;
function describeTriggerMode() {
  const preset = AdaptiveTriggers.presetFor(triggerMode.value, triggers.tuning);
  $('trigger-strength').value = preset.strength;
  $('trigger-speed').value = preset.frequency || 10;
  $('trigger-speed').disabled = preset.type !== 'vibration';
  describeTuning();
  $('trigger-mode-description').textContent = `${preset.label}: ${preset.description}`;
}
function describeTuning() {
  $('trigger-strength-label').textContent = $('trigger-strength').value + ' / 8';
  $('trigger-speed-label').textContent = $('trigger-speed').disabled ? 'Not used in this mode' : $('trigger-speed').value + ' Hz';
}
function tuningValues() { return { strength: Number($('trigger-strength').value), speed: $('trigger-speed').disabled ? 0 : Number($('trigger-speed').value) }; }
function presetProperties() { const { strength, speed } = tuningValues(); return { mode: triggerMode.value, strength, speed_hz: speed }; }
document.querySelector('.trigger-custom summary').addEventListener('click', event => {
  if (!event.currentTarget.parentElement.open) analytics.featureAction('trigger_presets', 'opened');
});
$('trigger-link').addEventListener('copy', () => {
  const setup = AdaptiveTriggers.setup.read($('trigger-link').value);
  if (setup) analytics.featureAction('trigger_presets', 'link_copied', { mode: setup.mode, strength: setup.strength, speed_hz: setup.speed });
});
for (const id of ['trigger-strength', 'trigger-speed']) {
  $(id).addEventListener('input', describeTuning);
  $(id).addEventListener('change', () => { analytics.featureAction('trigger_presets', 'changed', presetProperties()); void triggers.setTuning(tuningValues()).catch(error => { triggerStatus.textContent = error.message; }); });
}
$('trigger-defaults').addEventListener('click', () => {
  const pending = triggers.setMode(triggerMode.value); describeTriggerMode();
  analytics.featureAction('trigger_presets', 'reset', { mode: triggerMode.value });
  void pending.catch(error => { triggerStatus.textContent = error.message; });
});
$('trigger-share').addEventListener('click', async () => {
  const properties = presetProperties();
  const link = AdaptiveTriggers.setup.link(location.href, { mode: triggerMode.value, ...tuningValues() });
  $('trigger-link').value = link; $('trigger-link-wrap').hidden = false;
  analytics.featureAction('trigger_presets', 'link_created', properties);
  try { await navigator.clipboard.writeText(link); analytics.featureAction('trigger_presets', 'link_copied', properties); $('trigger-share-status').textContent = 'Preset link copied. Opening it keeps trigger effects off.'; }
  catch { $('trigger-link').focus(); $('trigger-link').select(); $('trigger-share-status').textContent = 'Copy the selected link to share your preset.'; }
});
describeTriggerMode();
try {
  const setup = AdaptiveTriggers.setup.read(location.href);
  if (setup) {
    triggerMode.value = setup.mode;
    await triggers.setMode(setup.mode); await triggers.setTuning(setup); describeTriggerMode();
    analytics.featureAction('trigger_presets', 'loaded', presetProperties());
    $('trigger-share-status').textContent = 'Shared preset loaded. Enable trigger effects to try it.';
    document.querySelector('.trigger-custom').open = true;
  }
} catch (error) { $('trigger-share-status').textContent = error.message; document.querySelector('.trigger-custom').open = true; }
$('trigger-mode').addEventListener('change', async event => {
  try { const pending = triggers.setMode(event.target.value); describeTriggerMode(); analytics.featureAction('trigger_presets', 'changed', presetProperties()); await pending; }
  catch (error) { triggerStatus.textContent = error.message; }
});
$('enable-triggers').addEventListener('click', async () => {
  triggerBusy = true; $('enable-triggers').disabled = true;
  $('enable-touchpad').disabled = true;
  try {
    await triggers.connect();
    if (document.hidden) await triggers.pause();
    if (triggers.active) analytics.once('controller_trigger_effects_enabled');
  } catch (error) {
    triggerStatus.textContent = error.name === 'NotAllowedError' ? 'Controller access was not granted. Choose Enable to try again.' : error.message;
  } finally {
    triggerBusy = false; $('enable-triggers').disabled = triggers.active || !navigator.hid;
    renderTouchpad();
  }
});
$('enable-touchpad').addEventListener('click', async () => {
  if (triggerBusy) return;
  if (touchpad.device && touchpad.enabled) { touchpad.setEnabled(false); analytics.featureAction('touchpad', 'disabled'); return; }
  triggerBusy = true; renderTouchpad(); renderGyro(); $('enable-triggers').disabled = true;
  try {
    await triggers.connect({ enableEffects: false });
    if (triggers.device) { touchpad.setEnabled(true); analytics.featureAction('touchpad', 'enabled'); }
    else sensorStatus('touchpad', 'No controller selected. Click the touchpad icon to try again.');
  } catch (error) {
    sensorStatus('touchpad', error.name === 'NotAllowedError' ? 'Controller access was not granted. Click the touchpad icon to try again.' : error.message);
  } finally {
    triggerBusy = false; renderTouchpad(); renderGyro();
    $('enable-triggers').disabled = triggers.active || !navigator.hid;
  }
});
$('disable-triggers').addEventListener('click', stopTriggers);
window.addEventListener('blur', () => { if (triggers.device) stopTriggers(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopTriggers(); });
window.addEventListener('pagehide', () => { void triggers.disconnect().catch(() => {}); });

function later(fn, milliseconds) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, milliseconds); timers.add(timer); }
function status(text, active = true) {
  clearTimeout(statusTimer); $('input-label').textContent = text; $('last-input').classList.toggle('active', active);
  if (!active) statusTimer = setTimeout(() => { $('input-label').textContent = 'Waiting for input'; }, 1800);
}
function tone(id) {
  if (!sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume().catch(() => {});
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.connect(gain); gain.connect(audio.destination);
    osc.frequency.setValueAtTime(['l2','r2','l3','r3'].includes(id) ? 140 : 240, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, audio.currentTime + .045);
    gain.gain.setValueAtTime(.045, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .065);
    osc.start(); osc.stop(audio.currentTime + .07);
  } catch { /* Sound is optional. */ }
}

const input = new ControllerInput(event => {
  range?.handleInput(event);
  inputCamera.observe(event);
  if (event.type === 'axis') {
    if (Math.hypot(event.x, event.y) > .1) analytics.interact('stick');
    for (const axis of ['x','y']) $(event.side + '-' + axis).textContent = (Math.abs(event[axis]) < .005 ? 0 : event[axis]).toFixed(2);
    $(event.side + '-dot').style.transform = `translate(${event.x * 12}px,${event.y * 12}px)`;
    return;
  }
  accessibleButtons.get(event.id)?.setAttribute('aria-pressed', String(event.value > 0));
  if (event.id === 'l2' || event.id === 'r2') {
    $(event.id + '-value').textContent = Math.round(event.value * 100) + '%';
    $(event.id + '-meter').style.width = event.value * 100 + '%';
  }
  if (event.value && !event.before) {
    analytics.interact('button');
    if (!range?.isOpen) tone(event.id); status(labels[event.id]);
    if (event.id === 'ps' && view) { view.lights = !view.lights; status(view.lights ? 'Light bars on' : 'Light bars off'); }
    if (event.id === 'mute' && view) { view.muted = !view.muted; status(view.muted ? 'Microphone mute on' : 'Microphone mute off'); }
  } else if (!event.value && event.before) {
    const remaining = [...input.buttons.keys()];
    status(remaining.length ? labels[remaining.at(-1)] : labels[event.id] + ' released', remaining.length > 0);
  }
});

function releaseAll() {
  heldKeys.clear();
  for (const timer of timers) clearTimeout(timer); timers.clear();
  const pointerIds = [...pointers.keys()]; pointers.clear();
  for (const id of pointerIds) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  input.reset(); view?.setTouchContacts('pointer', []); view?.setTouchContacts('hardware', []);
  inputCamera.observe({ type: 'button', id: 'touch-contact', value: 0 });
  canvas.style.cursor = 'grab';
}
function keyAxes() {
  for (const [side, codes] of Object.entries(stickKeys)) {
    const [left, right, up, down] = codes;
    if (codes.some(code => heldKeys.has(code))) input.setAxis(side, 'keyboard', Number(heldKeys.has(right)) - Number(heldKeys.has(left)), Number(heldKeys.has(down)) - Number(heldKeys.has(up)));
    else input.releaseAxis(side, 'keyboard');
  }
}
window.addEventListener('keydown', event => {
  if (range?.isOpen || drawing?.isOpen || diagnostics?.isOpen || leaderboard?.isOpen || event.ctrlKey || event.metaKey || event.altKey || help.open || event.target.closest?.('button,input,select,textarea,a')) return;
  if (!keyMap[event.code] && !analogCodes.has(event.code)) return;
  event.preventDefault(); if (event.repeat) return; heldKeys.add(event.code);
  if (keyMap[event.code]) input.setButton(keyMap[event.code], 'key:' + event.code, 1);
  else { keyAxes(); status(stickKeys.left.includes(event.code) ? 'Left stick' : 'Right stick'); }
});
window.addEventListener('keyup', event => {
  if (!heldKeys.delete(event.code)) return;
  if (keyMap[event.code]) input.setButton(keyMap[event.code], 'key:' + event.code, 0);
  if (analogCodes.has(event.code)) { keyAxes(); status('Stick centered', false); }
});
window.addEventListener('blur', () => { touchpad.setPaused(true); releaseAll(); });
window.addEventListener('focus', () => { touchpad.setPaused(document.hidden || help.open || range?.isOpen || diagnostics?.isOpen || leaderboard?.isOpen); });
document.addEventListener('visibilitychange', () => {
  touchpad.setPaused(document.hidden || !document.hasFocus() || help.open || range?.isOpen || diagnostics?.isOpen || leaderboard?.isOpen);
  if (document.hidden) releaseAll();
});

canvas.addEventListener('pointerdown', event => {
  if (!view?.ready || event.button !== 0) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  const hit = view.hit(event.clientX, event.clientY);
  const id = hit?.id;
  const side = id === 'left-stick' ? 'left' : id === 'right-stick' ? 'right' : null;
  if (side && [...pointers.values()].some(pointer => pointer.side === side)) return;
  canvas.setPointerCapture(event.pointerId);
  const pointer = { id, side, startX:event.clientX, startY:event.clientY, moved:false, pose:{...view.pose}, local:side ? view.stickPoint(event.clientX,event.clientY,side) : null };
  pointers.set(event.pointerId, pointer);
  if (side) { input.setAxis(side, 'pointer', 0, 0); status(side === 'left' ? 'Left stick' : 'Right stick'); canvas.style.cursor = 'grabbing'; }
  else if (id && id !== 'lights') { input.setButton(id, 'pointer:' + event.pointerId, 1); if (id === 'touchpad') view.touch(hit.point); }
  else { setAutoView(false); canvas.style.cursor = 'grabbing'; document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed','false')); }
});
canvas.addEventListener('pointermove', event => {
  if (!view?.ready) return;
  const pointer = pointers.get(event.pointerId);
  if (!pointer) {
    const hit = view.hit(event.clientX,event.clientY);
    canvas.style.cursor = hit?.id && hit.id !== 'lights' ? hit.id.endsWith('-stick') ? 'grab' : 'pointer' : 'grab';
    const hint = hit?.id ? labels[hit.id] || hit.id.replace('-',' ') : '';
    $('hover-label').textContent = hint; return;
  }
  const dx = event.clientX - pointer.startX, dy = event.clientY - pointer.startY;
  if (Math.hypot(dx,dy) > 5) pointer.moved = true;
  if (pointer.side) {
    const point = view.stickPoint(event.clientX,event.clientY,pointer.side);
    if (point && pointer.local) input.setAxis(pointer.side,'pointer',(point.x-pointer.local.x)/.28,-(point.y-pointer.local.y)/.28);
  } else if (pointer.id === 'l2' || pointer.id === 'r2') input.setButton(pointer.id,'pointer:'+event.pointerId,1+dy/120);
  else if (pointer.id === 'touchpad') { const hit=view.hit(event.clientX,event.clientY); if(hit?.id==='touchpad')view.touch(hit.point); }
  else if (!pointer.id || pointer.id === 'lights') {
    if (pointer.moved && gyro.enabled) disableGyro();
    if (pointer.moved) analytics.interact('rotate');
    view.pose.x = Math.max(-1.4,Math.min(1.4,pointer.pose.x+dy*.008));
    view.pose.y = pointer.pose.y+dx*.008;
    view.pose.z = 0;
  }
});
function releasePointer(event, cancelled = false) {
  const pointer = pointers.get(event.pointerId); if (!pointer) return;
  pointers.delete(event.pointerId);
  if (pointer.side) {
    input.releaseAxis(pointer.side,'pointer');
    if (!cancelled && !pointer.moved) {
      const id = pointer.side === 'left' ? 'l3' : 'r3';
      input.setButton(id,'tap',1); later(()=>input.setButton(id,'tap',0),120);
    } else status('Stick centered',false);
  } else if (pointer.id) input.setButton(pointer.id,'pointer:'+event.pointerId,0);
  if (pointer.id === 'touchpad') view.touch(null);
  if (inputCamera.enabled && !pointers.size) inputCamera.setEnabled(true);
  canvas.style.cursor='grab';
}
canvas.addEventListener('pointerup', event=>releasePointer(event));
canvas.addEventListener('pointercancel', event=>releasePointer(event,true));
canvas.addEventListener('lostpointercapture', event=>releasePointer(event,true));
canvas.addEventListener('pointerleave', () => { $('hover-label').textContent=''; });
canvas.addEventListener('wheel',event=>{if(!view?.ready)return;event.preventDefault();analytics.interact('zoom');view.zoom=Math.max(.75,Math.min(1.6,view.zoom-event.deltaY*.001));view.resize();},{passive:false});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();releaseAll();if(view)view.contextLost=true;showError('The 3D view was interrupted. Reload it to continue.');});

for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click',()=>{
  if (gyro.enabled) disableGyro();
  if(!view?.ready)return;setAutoView(false);releaseAll();view.setView(button.dataset.view);analytics.interact('view');
  document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
});
for (const button of document.querySelectorAll('[data-finish]')) button.addEventListener('click',()=>{
  if(!view?.ready)return;appearance.setColor('body',view.setFinish(button.dataset.finish),false);analytics.finish(button.dataset.finish);
  document.querySelectorAll('[data-finish]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  const name={white:'White',black:'Midnight Black',red:'Cosmic Red'}[button.dataset.finish];
  $('finish-label').textContent=name;$('announcement').textContent=name+' selected';
});
$('sound').addEventListener('click',()=>{
  analytics.interact('sound');sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Disable button sounds':'Enable button sounds');
  $('sound-lines').setAttribute('d',sound?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 5 6m0-6-5 6');if(sound)tone('cross');
});
$('reset').addEventListener('click',()=>{
  if (gyro.enabled) disableGyro();
  stopTriggers();
  releaseAll();if(view){view.lights=true;view.muted=false;view.setView('front');}
  inputCamera.reset();$('auto-view').setAttribute('aria-pressed','true');
  status('Controller reset',false);$('announcement').textContent='Controller reset. Sticks centered and front view restored.';
});
$('show-help').addEventListener('click',()=>{stopTriggers();touchpad.setPaused(true);releaseAll();help.showModal();});
help.addEventListener('close', () => touchpad.setPaused(document.hidden || !document.hasFocus()));
$('close-help').addEventListener('click',()=>help.close());
help.addEventListener('click',event=>{if(event.target!==help)return;const r=help.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)help.close();});
$('retry').addEventListener('click',()=>location.reload());

const padMap=['cross','circle','square','triangle','l1','r1','l2','r2','create','options','l3','r3','up','down','left','right','ps','touchpad'];
function gamepads(){try{return [...(navigator.getGamepads?.()||[])];}catch{return [];}}
function discoverPad(){
  const pad=gamepads().find(Boolean),next=pad?.index??null;if(next===gamepadIndex)return;
  input.releaseSource('gamepad');gamepadIndex=next;
  $('mode-label').textContent=pad?'Controller connected':'Virtual controller';
  $('connect-note').textContent=pad?(pad.mapping==='standard'?'Your controller is connected. All inputs are live.':'This controller uses a custom layout. Use the on-screen controls.'):'Connect your controller and press any button to mirror it here.';
  if(pad)analytics.once('controller_gamepad_connected', { mapping: pad.mapping || 'custom' });
  if(pad&&!gamepadFrame)gamepadFrame=requestAnimationFrame(pollPad);
  if(!pad){cancelAnimationFrame(gamepadFrame);gamepadFrame=0;}
}
function pollPad(){
  gamepadFrame=requestAnimationFrame(pollPad);
  if(document.hidden||!document.hasFocus()||help.open||drawing?.isOpen||diagnostics?.isOpen||leaderboard?.isOpen||!view?.ready)return;
  const pad=gamepads()[gamepadIndex];if(!pad||pad.mapping!=='standard')return;
  padMap.forEach((id,index)=>{const value=pad.buttons[index]?.value||0;input.setButton(id,'gamepad',value>.04?value:0);});
  for(const [side,offset]of [['left',0],['right',2]]){
    const deadzone=value=>Math.abs(value||0)<.075?0:value;
    input.setAxis(side,'gamepad',deadzone(pad.axes[offset]),deadzone(pad.axes[offset+1]));
  }
}
window.addEventListener('gamepadconnected',discoverPad);window.addEventListener('gamepaddisconnected',discoverPad);

function addAccessibleControls(){
  for(const [id,label]of Object.entries(labels)){
    const button=document.createElement('button');button.className='mesh-focus';button.setAttribute('aria-label',label);button.setAttribute('aria-pressed','false');button.textContent=label;
    accessibleButtons.set(id,button);$('focus-controls').append(button);
    button.addEventListener('keydown',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();event.stopPropagation();input.setButton(id,'focus',1);}});
    button.addEventListener('keyup',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();event.stopPropagation();input.setButton(id,'focus',0);}});
    button.addEventListener('blur',()=>input.setButton(id,'focus',0));
    button.addEventListener('click',event=>{if(event.detail===0){input.setButton(id,'assistive',1);later(()=>input.setButton(id,'assistive',0),130);}});
  }
  view.onRender=()=>{
    for (const id of ['l2', 'r2']) {
      const tag = $(id + '-tag');
      const amount = input.button(id);
      tag.hidden = !inputCamera.enabled || inputCamera.view !== 'triggers';
      if (tag.hidden) continue;
      const point = view.projected(id);
      if (point) { tag.style.left = point.x + 'px'; tag.style.top = point.y + 'px'; }
      tag.textContent = id.toUpperCase() + ' · ' + Math.round(amount * 100) + '%';
      tag.classList.toggle('active', amount > .05);
    }
    const button=document.activeElement;
    if(!button?.classList.contains('mesh-focus'))return;
    const id=[...accessibleButtons].find(([,el])=>el===button)?.[0];
    const point=view.projected(id==='l3'?'left-stick':id==='r3'?'right-stick':id);
    if(point){button.style.left=point.x+'px';button.style.top=point.y+'px';}
  };
}
function showError(message){stopTriggers();$('loading').hidden=true;$('load-error').hidden=false;$('error-message').textContent=message;}
range = new TargetPracticeView({
  leaderboardClient,
  onAction: (feature, action, properties) => analytics.featureAction(feature, action, properties),
  input,
  onOpen: () => { releaseAll(); touchpad.setPaused(true); if (view) view.suspended = true; },
  onClose: () => { if (view) view.suspended = false; touchpad.setPaused(document.hidden || !document.hasFocus()); },
  onWeapon: mode => {
    triggerMode.value = mode;
    const pending = triggers.setMode(mode); describeTriggerMode();
    void pending.catch(error => { triggerStatus.textContent = error.message; });
  },
  onEnableEffects: async () => {
    if (!navigator.hid) throw new Error('Use desktop Chrome or Edge for adaptive triggers. You can still play here.');
    await triggers.connect();
    if (document.hidden || !range.isOpen) await triggers.pause();
  },
  onStopEffects: stopTriggers,
  effectsActive: () => triggers.active,
  onShot: () => tone('r2'),
});
function closeStudioTool() { releaseAll(); if (view) view.suspended = false; touchpad.setPaused(document.hidden || !document.hasFocus()); }
drawing = new TouchDrawingView({
  onAction: (feature, action, properties) => analytics.featureAction(feature, action, properties),
  onOpen: () => { stopTriggers(); releaseAll(); if (view) view.suspended = true; touchpad.setPaused(document.hidden || !document.hasFocus()); },
  onClose: closeStudioTool,
  onConnect: async () => {
    await triggers.connect({ enableEffects: false });
    if (triggers.device) touchpad.setEnabled(true);
    else drawing.message('No controller selected. Try enabling the touchpad again.');
  },
});
diagnostics = new DiagnosticsView({
  onAction: (feature, action, properties) => analytics.featureAction(feature, action, properties),
  getPad: () => gamepads()[gamepadIndex] || gamepads().find(Boolean),
  labels: padMap.map(id => labels[id]),
  onOpen: () => { stopTriggers(); releaseAll(); touchpad.setPaused(true); if (view) view.suspended = true; },
  onClose: closeStudioTool,
});
leaderboard = new LeaderboardView({
  client: leaderboardClient,
  onAction: (feature, action, properties) => analytics.featureAction(feature, action, properties),
  onOpen: () => { range?.pause(); stopTriggers(); releaseAll(); touchpad.setPaused(true); if (view) view.suspended = true; },
  onClose: () => { if (view) view.suspended = range?.isOpen; touchpad.setPaused(document.hidden || !document.hasFocus() || range?.isOpen); },
});
$('range-leaderboard').addEventListener('click', () => leaderboard.open());
$('open-drawing').addEventListener('click', () => drawing.open());
$('open-diagnostics').addEventListener('click', () => diagnostics.open());
$('open-range').addEventListener('click', () => { range.open(triggerMode.value); analytics.interact('target_practice'); });
try{
  view=new DualSenseView(canvas,input);
  await view.load(percent=>{$('load-progress').textContent=percent+'%';});
  view.setLightColor(appearance.input('light').value);
  $('open-appearance').disabled = false;
  analytics.once('controller_loaded');
  view.setView('front');addAccessibleControls();$('loading').hidden=true;$('viewer').setAttribute('aria-busy','false');
  document.querySelectorAll('[data-finish],[data-view]').forEach(button=>button.disabled=false);
  $('auto-view').disabled=false;
  discoverPad();
}catch(error){console.error('DualSense 3D:',error);showError('The 3D controller could not load. Reload to try again, or use a browser with WebGL enabled.');}
window.addEventListener('pagehide',()=>{range?.dispose();drawing?.dispose();diagnostics?.dispose();releaseAll();cancelAnimationFrame(gamepadFrame);view?.dispose();void audio?.close().catch(()=>{});});
