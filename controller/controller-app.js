import { AdaptiveTriggers } from './adaptive-triggers.js';
import { analytics } from './analytics.js';
import { ControllerInput } from './input-state.js';
import { InputCamera } from './input-camera.js';
import { DualSenseView } from './controller-view.js';

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
let view, audio, sound = false, statusTimer, gamepadIndex = null, gamepadFrame = 0;
const inputCamera = new InputCamera(angle => {
  // Keep a dragged control under the pointer until the gesture ends.
  if (!view?.ready || pointers.size) return;
  view.setView(angle, { resetZoom: false });
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
});
function setAutoView(enabled) {
  inputCamera.setEnabled(enabled);
  $('auto-view').setAttribute('aria-pressed', String(enabled));
}
$('auto-view').addEventListener('click', () => setAutoView(!inputCamera.enabled));

const triggerStatus = $('trigger-effect-status');
let triggerBusy = false;
const triggers = new AdaptiveTriggers(navigator.hid, state => {
  triggerStatus.textContent = state.message;
  $('disable-triggers').disabled = !state.connected;
  $('enable-triggers').textContent = state.active ? 'Trigger effects enabled' : 'Enable trigger effects';
  $('enable-triggers').disabled = triggerBusy || state.active || !navigator.hid;
});
if (!navigator.hid || !window.isSecureContext) {
  $('enable-triggers').disabled = true;
  triggerStatus.textContent = 'Open this site in desktop Chrome or Edge to feel real trigger resistance.';
}
function stopTriggers() {
  void triggers.pause().catch(error => { triggerStatus.textContent = error.message; });
}
const triggerMode = $('trigger-mode');
triggerMode.replaceChildren(...Object.entries(AdaptiveTriggers.presets).map(([mode, preset]) => new Option(preset.label, mode)));
triggerMode.value = triggers.mode;
function describeTriggerMode() {
  const preset = AdaptiveTriggers.presetFor(triggerMode.value);
  $('trigger-mode-description').textContent = `${preset.label}: ${preset.description}`;
}
describeTriggerMode();
$('trigger-mode').addEventListener('change', async event => {
  describeTriggerMode();
  try { await triggers.setMode(event.target.value); }
  catch (error) { triggerStatus.textContent = error.message; }
});
$('enable-triggers').addEventListener('click', async () => {
  triggerBusy = true; $('enable-triggers').disabled = true;
  try {
    await triggers.connect();
    if (document.hidden) await triggers.pause();
    if (triggers.active) analytics.once('controller_trigger_effects_enabled');
  } catch (error) {
    triggerStatus.textContent = error.name === 'NotAllowedError' ? 'Controller access was not granted. Choose Enable to try again.' : error.message;
  } finally {
    triggerBusy = false; $('enable-triggers').disabled = triggers.active || !navigator.hid;
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
    tone(event.id); status(labels[event.id]);
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
  input.reset(); canvas.style.cursor = 'grab';
}
function keyAxes() {
  for (const [side, codes] of Object.entries(stickKeys)) {
    const [left, right, up, down] = codes;
    if (codes.some(code => heldKeys.has(code))) input.setAxis(side, 'keyboard', Number(heldKeys.has(right)) - Number(heldKeys.has(left)), Number(heldKeys.has(down)) - Number(heldKeys.has(up)));
    else input.releaseAxis(side, 'keyboard');
  }
}
window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || help.open || event.target.closest?.('button,input,select,textarea,a')) return;
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
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

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
  if(!view?.ready)return;setAutoView(false);releaseAll();view.setView(button.dataset.view);analytics.interact('view');
  document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
});
for (const button of document.querySelectorAll('[data-finish]')) button.addEventListener('click',()=>{
  if(!view?.ready)return;view.setFinish(button.dataset.finish);analytics.finish(button.dataset.finish);
  document.querySelectorAll('[data-finish]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));
  const name={white:'White',black:'Midnight Black',red:'Cosmic Red'}[button.dataset.finish];
  $('finish-label').textContent=name;$('announcement').textContent=name+' selected';
});
$('sound').addEventListener('click',()=>{
  analytics.interact('sound');sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Disable button sounds':'Enable button sounds');
  $('sound-lines').setAttribute('d',sound?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 5 6m0-6-5 6');if(sound)tone('cross');
});
$('reset').addEventListener('click',()=>{
  stopTriggers();
  releaseAll();if(view){view.lights=true;view.muted=false;view.setView('front');}
  inputCamera.reset();$('auto-view').setAttribute('aria-pressed','true');
  status('Controller reset',false);$('announcement').textContent='Controller reset. Sticks centered and front view restored.';
});
$('show-help').addEventListener('click',()=>{stopTriggers();releaseAll();help.showModal();});
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
  if(document.hidden||!document.hasFocus()||help.open||!view?.ready)return;
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
try{
  view=new DualSenseView(canvas,input);
  await view.load(percent=>{$('load-progress').textContent=percent+'%';});
  analytics.once('controller_loaded');
  view.setView('front');addAccessibleControls();$('loading').hidden=true;$('viewer').setAttribute('aria-busy','false');
  document.querySelectorAll('[data-finish],[data-view]').forEach(button=>button.disabled=false);
  $('auto-view').disabled=false;
  discoverPad();
}catch(error){console.error('DualSense 3D:',error);showError('The 3D controller could not load. Reload to try again, or use a browser with WebGL enabled.');}
window.addEventListener('pagehide',()=>{releaseAll();cancelAnimationFrame(gamepadFrame);view?.dispose();void audio?.close().catch(()=>{});});
