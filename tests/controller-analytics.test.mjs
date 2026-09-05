import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerAnalytics } from '../controller/analytics-service.js';

function harness() {
  let clock = 0;
  const events = [];
  const analytics = new ControllerAnalytics((name, properties) => events.push({ name, ...properties }), () => clock);
  return { analytics, events, advance: ms => { clock += ms; } };
}

test('repeated presses count one engaged visit and one use of each feature', () => {
  const { analytics, events } = harness();
  for (let i = 0; i < 100; i++) analytics.interact('button');
  analytics.interact('stick');
  assert.equal(events.filter(e => e.name === 'controller_interacted').length, 1);
  assert.deepEqual(events.filter(e => e.name === 'controller_feature_used').map(e => e.feature), ['button', 'stick']);
});

test('each selected color is counted once per visit', () => {
  const { analytics, events } = harness();
  analytics.finish('red'); analytics.finish('red'); analytics.finish('black');
  assert.deepEqual(events.filter(e => e.name === 'controller_finish_selected').map(e => e.finish), ['red', 'black']);
});

test('active time excludes idle and hidden time and flushes only new seconds', () => {
  const { analytics, events, advance } = harness();
  advance(60000); analytics.flush();
  assert.equal(events.length, 0);
  analytics.interact('button'); advance(2000); analytics.interact('stick');
  advance(60000); analytics.pause();
  advance(60000); analytics.flush();
  analytics.interact('button'); advance(1500); analytics.pause();
  assert.deepEqual(events.filter(e => e.name === 'controller_active_time').map(e => e.seconds), [7, 1]);
});

test('analytics failures never interrupt interaction handling', () => {
  const analytics = new ControllerAnalytics(() => { throw new Error('Tracking blocked'); }, () => 0);
  assert.doesNotThrow(() => { analytics.interact('button'); analytics.finish('red'); analytics.pause(); });
});

test('new features count reach once while deliberate repeated actions remain countable', () => {
  const { analytics, events } = harness();
  for (const feature of ['touchpad_drawing', 'trigger_presets', 'diagnostics']) {
    analytics.featureAction(feature, 'opened'); analytics.featureAction(feature, 'opened');
  }
  for (let i = 0; i < 2; i++) analytics.featureAction('scorecard', 'exported', { score: 100, hits: 1, shots: 2, weapons: ['shotgun'] });
  assert.equal(events.filter(e => e.name === 'controller_feature_used').length, 4);
  assert.equal(events.filter(e => e.name === 'controller_touchpad_drawing_opened').length, 2);
  assert.equal(events.filter(e => e.name === 'controller_scorecard_exported').length, 2);
  assert.equal(events.find(e => e.name === 'controller_scorecard_exported').accuracy, 50);
});

test('drawing source and diagnostic connection discovery cannot flood analytics', () => {
  const { analytics, events } = harness();
  for (let i = 0; i < 100; i++) {
    analytics.featureAction('touchpad_drawing', 'started', { input_source: 'hardware' });
    analytics.featureAction('diagnostics', 'connected');
  }
  analytics.featureAction('touchpad_drawing', 'started', { input_source: 'pointer' });
  assert.deepEqual(events.filter(e => e.name === 'controller_touchpad_drawing_started').map(e => e.input_source), ['hardware', 'pointer']);
  assert.equal(events.filter(e => e.name === 'controller_diagnostics_connected').length, 1);
});

test('only approved properties are captured and each action keeps its own contract', () => {
  const { analytics, events } = harness();
  const privateData = { x: .4, y: .5, axes: [.02], device_id: 'controller serial', drawing: 'image data', url: 'private link', error: 'raw error' };
  analytics.featureAction('touchpad_drawing', 'exported', privateData);
  analytics.featureAction('diagnostics', 'measurement_completed', privateData);
  analytics.featureAction('trigger_presets', 'changed', { ...privateData, mode: 'lmg', strength: 5, speed_hz: 22 });
  analytics.featureAction('scorecard', 'exported', { ...privateData, score: 250, shots: 0, hits: 0, weapons: ['shotgun', 'private string'] });
  for (const event of events) for (const key of Object.keys(privateData)) assert.equal(Object.hasOwn(event, key), false);
  assert.deepEqual(events.find(e => e.name === 'controller_trigger_presets_changed'), { name: 'controller_trigger_presets_changed', mode: 'lmg', strength: 5, speed_hz: 22 });
  assert.deepEqual(events.find(e => e.name === 'controller_scorecard_exported').weapons, ['shotgun']);
  assert.equal(events.find(e => e.name === 'controller_scorecard_exported').accuracy, 0);
  const count = events.length;
  analytics.featureAction('unknown', 'opened'); analytics.featureAction('scorecard', 'unknown'); analytics.featureAction('__proto__', 'toString');
  assert.equal(events.length, count);
});

test('export failures stay separate from successes and blocked tracking never stops new tools', () => {
  const { analytics, events } = harness();
  analytics.featureAction('scorecard', 'export_failed'); analytics.featureAction('touchpad_drawing', 'export_failed');
  assert.equal(events.filter(e => e.name.endsWith('_exported')).length, 0);
  const blocked = new ControllerAnalytics(() => { throw new Error('Blocked'); });
  assert.doesNotThrow(() => {
    blocked.featureAction('touchpad_drawing', 'started', { input_source: 'pointer' });
    blocked.featureAction('trigger_presets', 'link_created', { mode: 'lmg', strength: 8, speed_hz: 30 });
    blocked.featureAction('diagnostics', 'measurement_completed');
    blocked.featureAction('scorecard', 'exported', { score: 100, hits: 1, shots: 1, weapons: ['shooting'] });
  });
});

test('arriving at a shared preset does not count as a deliberate interaction', () => {
  const { analytics, events } = harness();
  analytics.featureAction('trigger_presets', 'loaded', { mode: 'smg', strength: 3, speed_hz: 18 });
  assert.deepEqual(events.map(e => e.name), ['controller_trigger_presets_loaded']);
  analytics.featureAction('trigger_presets', 'changed', { mode: 'smg', strength: 4, speed_hz: 18 });
  assert.equal(events.filter(e => e.name === 'controller_interacted').length, 1);
});

test('leaderboard usage captures scores without nicknames or player identifiers', () => {
  const { analytics, events } = harness();
  analytics.featureAction('leaderboard', 'opened');
  analytics.featureAction('leaderboard', 'submitted', { score: 250, nickname: 'Private nickname', player: 'private player', roundId: 'private round' });
  assert.deepEqual(events.find(event => event.name === 'controller_leaderboard_submitted'), { name: 'controller_leaderboard_submitted', score: 250 });
});

test('battery connection analytics omit charge readings and hardware identifiers', () => {
  const { analytics, events } = harness();
  analytics.featureAction('battery', 'connect_requested', { level: 95, status: 'charging', deviceId: 'private' });
  assert.deepEqual(events.find(event => event.name === 'controller_battery_connect_requested'), { name: 'controller_battery_connect_requested' });
  analytics.once('controller_battery_reading_available'); analytics.once('controller_battery_reading_available');
  assert.equal(events.filter(event => event.name === 'controller_battery_reading_available').length, 1);
});

test('appearance analytics separate light and body actions without collecting color or device data', () => {
  const { analytics, events } = harness();
  analytics.featureAction('appearance', 'changed', { target: 'light', color: '#ff0000', device: 'private' });
  analytics.featureAction('appearance', 'changed', { target: 'body', color: '#ffffff' });
  assert.deepEqual(events.filter(event => event.name === 'controller_appearance_changed'), [
    { name: 'controller_appearance_changed', target: 'light' }, { name: 'controller_appearance_changed', target: 'body' },
  ]);
});
