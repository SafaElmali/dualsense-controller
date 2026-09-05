import test from 'node:test';
import assert from 'node:assert/strict';
import { TargetPractice } from '../controller/target-practice.js';

function setup(mode = 'shooting') {
  const shots = [];
  const game = new TargetPractice({ onShot: shot => shots.push(shot) });
  game.setWeapon(mode); game.start();
  game.targets = [{ x: 500, y: 250, radius: 36, phase: 0, respawnAt: null }];
  return { game, shots };
}

test('single-shot weapons need release, use their own break threshold and cannot bypass cooldown', () => {
  for (const mode of ['shooting', 'shotgun']) {
    const { game } = setup(mode);
    game.step(.01, { pressure: 1 }); assert.equal(game.shots, 0);
    game.trigger(0); game.trigger(.5); assert.equal(game.shots, 0);
    game.trigger(1); assert.equal(game.shots, 1);
    game.step(1, { pressure: 1 }); assert.equal(game.shots, 1);
    game.trigger(0); game.trigger(1); assert.equal(game.shots, 2);
    game.trigger(0); game.trigger(1); assert.equal(game.shots, 2);
  }
});

test('automatic weapons repeat while held and stop on release, with SMG faster than LMG', () => {
  const counts = [];
  for (const mode of ['lmg', 'smg']) {
    const { game } = setup(mode); game.trigger(0);
    for (let i = 0; i < 120; i++) game.step(1 / 120, { pressure: 1 });
    counts.push(game.shots);
    for (let i = 0; i < 120; i++) game.step(1 / 120, { pressure: 0 });
    assert.equal(game.shots, counts.at(-1));
  }
  assert.ok(counts[0] >= 9 && counts[0] <= 11);
  assert.ok(counts[1] >= 17 && counts[1] <= 19);
});

test('bullseyes, misses, accuracy and streak bonuses reflect actual target collisions', () => {
  const { game, shots } = setup();
  const center = game.position(game.targets[0]); game.setAim(center.x, center.y);
  game.trigger(0); game.trigger(1);
  assert.equal(game.score, 100); assert.equal(game.hits, 1); assert.equal(game.accuracy, 100);
  assert.equal(shots[0].hit, true);
  game.step(.31); game.setAim(20, 30); game.trigger(1);
  assert.equal(game.score, 100); assert.equal(game.streak, 0); assert.equal(game.accuracy, 50);
});

test('Shotgun spreads cover near misses that Pistol cannot hit', () => {
  for (const [mode, hits] of [['shooting', 0], ['shotgun', 1]]) {
    const { game } = setup(mode); const center = game.position(game.targets[0]);
    game.setAim(center.x + 50, center.y); game.trigger(0); game.trigger(1);
    assert.equal(game.hits, hits);
  }
});

test('a new hit adds a streak bonus while a destroyed target cannot score twice', () => {
  const { game } = setup();
  let center = game.position(game.targets[0]); game.setAim(center.x, center.y);
  game.trigger(0); game.trigger(1);
  assert.equal(game.score, 100);
  game.step(.24); game.trigger(1);
  assert.equal(game.hits, 1); assert.equal(game.score, 100);
  game.step(.1);
  center = game.position(game.targets[0]); game.setAim(center.x, center.y); game.trigger(0);
  game.step(.25); center = game.position(game.targets[0]); game.setAim(center.x, center.y); game.trigger(1);
  assert.equal(game.hits, 2); assert.equal(game.score, 200);
  // The intervening miss resets the streak; the following consecutive hit earns a bonus.
  game.step(.31); center = game.position(game.targets[0]); game.setAim(center.x, center.y); game.trigger(1);
  assert.equal(game.score, 310); assert.equal(game.streak, 2);
});

test('pause freezes timer and firing; resume and weapon switches require a fresh release', () => {
  const { game } = setup('lmg'); game.trigger(0); game.step(1, { pressure: 1 });
  const shots = game.shots; game.pause(); game.step(20, { pressure: 1 }); game.trigger(1);
  assert.equal(game.elapsed, 1); assert.equal(game.shots, shots);
  game.resume(); game.step(1, { pressure: 1 }); assert.equal(game.shots, shots);
  game.trigger(0); game.trigger(1); assert.equal(game.shots, shots + 1);
  game.setWeapon('smg'); game.step(1, { pressure: 1 }); assert.equal(game.shots, shots + 1);
});

test('round completion stops shots at 45 seconds, and replay clears the score', () => {
  const { game } = setup('lmg'); game.trigger(0); game.step(45, { pressure: 1 });
  assert.equal(game.state, 'finished'); assert.equal(game.remaining, 0); assert.equal(game.shots, 0);
  game.trigger(1); assert.equal(game.shots, 0);
  game.start(); assert.equal(game.state, 'playing'); assert.equal(game.elapsed, 0); assert.equal(game.targets.length, 3);
  assert.equal(game.score, 0); assert.equal(game.accuracy, 0);
});

test('aim stays within the field and stalled frames never produce a backlog of shots', () => {
  const { game } = setup('smg'); game.setAim(-100, 900); assert.deepEqual(game.aim, { x: 20, y: 530 });
  game.trigger(0); game.step(2, { pressure: 1, x: 1, y: -1 });
  assert.equal(game.shots, 1); assert.equal(game.elapsed, 2);
  assert.ok(game.aim.x <= 46);
  assert.throws(() => game.setWeapon('missing'), /Unknown/);
});
