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
