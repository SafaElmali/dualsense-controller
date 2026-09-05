import test from 'node:test';
import assert from 'node:assert/strict';
import { LeaderboardService } from '../server/leaderboard-service.mjs';
import { LeaderboardClient } from '../controller/leaderboard.js';

class Store {
  constructor() { this.records = new Map(); this.version = 0; }
  async getWithMetadata(key) { return structuredClone(this.records.get(key) || null); }
  async get(key) { return structuredClone(this.records.get(key)?.data || null); }
  async setJSON(key, data, options) {
    const current = this.records.get(key);
    if (options.onlyIfNew && current || options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: structuredClone(data), etag }); return { modified: true, etag };
  }
}
function fixture() {
  const store = new Store(); let now = 0, sequence = 0;
  return { service: new LeaderboardService(store, { now: () => now, uuid: () => 'round-' + ++sequence }), store, advance: n => { now += n; } };
}
const result = (score = 100, hits = 1, shots = 2, weapons = ['shooting']) => ({ score, hits, shots, weapons });

test('finished rounds persist across service instances and expose only public leaderboard fields', async () => {
  const { service, store, advance } = fixture();
  const { roundId } = await service.start('player-a'); advance(45000);
  assert.deepEqual(await service.submit('player-a', roundId, '  Safa  ', result()), { rank: 1, improved: true });
  const read = new LeaderboardService(store);
  assert.deepEqual(await read.list('player-a'), { entries: [{ rank: 1, nickname: 'Safa', score: 100, accuracy: 50, weapons: ['shooting'], mine: true }] });
  assert.equal((await read.list('someone-else')).entries[0].mine, false);
  assert.equal(JSON.stringify(await read.list('other')).includes('player-a'), false);
});
test('scores require the right player, a completed server-timed round, and an unexpired ticket', async () => {
  const { service, advance } = fixture(); const { roundId } = await service.start('a');
  await assert.rejects(service.submit('a', roundId, 'Name', result()), /45-second/);
  advance(45000); await assert.rejects(service.submit('b', roundId, 'Name', result()), /no longer/);
  advance(3600000); await assert.rejects(service.submit('a', roundId, 'Name', result()), /45-second/);
  assert.deepEqual((await service.list()).entries, []);
});
test('invalid names, impossible scores and invalid weapons never reach the board', () => {
  const { service } = fixture();
  for (const name of ['', 'x', '<script>', 'x'.repeat(21)]) assert.throws(() => service.validate(name, result()));
  for (const bad of [result(-1), result(151), result(55), result(100, 3, 2), result(100, 1, 901), result(0, 0, 0), result(100, 1, 2, ['unknown']), result(100, 1, 2, ['smg', 'smg']), result(NaN)]) assert.throws(() => service.validate('Player', bad));
  assert.equal(service.validate('Çağrı', result()).nickname, 'Çağrı');
});
test('retried submissions cannot duplicate or alter a completed round', async () => {
  const { service, advance } = fixture(); const { roundId } = await service.start('a'); advance(45000);
  await Promise.all([service.submit('a', roundId, 'First', result()), service.submit('a', roundId, 'First', result())]);
  await service.submit('a', roundId, 'Changed', result(150));
  const { entries } = await service.list(); assert.equal(entries.length, 1); assert.equal(entries[0].nickname, 'First'); assert.equal(entries[0].score, 100);
});
test('simultaneous players are preserved and rank ties use accuracy then earlier submission', async () => {
  const { service, advance } = fixture(); const [a, b] = await Promise.all([service.start('a'), service.start('b')]); advance(45000);
  await Promise.all([service.submit('a', a.roundId, 'Player A', result(100, 1, 2)), service.submit('b', b.roundId, 'Player B', result(100, 1, 1))]);
  assert.deepEqual((await service.list()).entries.map(row => row.nickname), ['Player B', 'Player A']);
  const c = await service.start('c'); advance(45000); await service.submit('c', c.roundId, 'Player C', result(100, 1, 1));
  assert.deepEqual((await service.list()).entries.map(row => row.nickname), ['Player B', 'Player C', 'Player A']);
});
test('new rounds keep personal bests and invalidate older unfinished tickets', async () => {
  const { service, advance } = fixture(); const a = await service.start('a'); advance(45000);
  await service.submit('a', a.roundId, 'Player', result(150));
  const b = await service.start('a'); advance(45000);
  assert.equal((await service.submit('a', b.roundId, 'Player', result(100))).improved, false);
  const c = await service.start('a'); advance(45000);
  await assert.rejects(service.submit('a', b.roundId, 'Player', result(150)), /no longer/);
  await service.submit('a', c.roundId, 'Player', result(200, 2, 3));
  assert.equal((await service.list()).entries[0].score, 200);
});
test('the public board is capped at 50 and storage retains at most 100 best scores', async () => {
  const { service, store, advance } = fixture();
  for (let i = 0; i < 105; i++) { const ticket = await service.start('p' + i); advance(45000); await service.submit('p' + i, ticket.roundId, 'Player ' + i, result()); }
  assert.equal((await service.list()).entries.length, 50); assert.equal((await store.get('board/v1')).entries.length, 100);
});
test('rate limits survive independent requests, reset after an hour and do not store raw IPs', async () => {
  const { service, store, advance } = fixture();
  for (let i = 0; i < 180; i++) await service.limit('192.0.2.20');
  await assert.rejects(service.limit('192.0.2.20'), error => error.status === 429);
  assert.equal([...store.records.keys()].some(key => key.includes('192.0.2.20')), false);
  advance(3600000); await service.limit('192.0.2.20');
});
test('the client handles unavailable hosting and preserves server validation messages', async () => {
  const missing = new LeaderboardClient(async () => new Response('<html>Not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(missing.list(), /live site/);
  const invalid = new LeaderboardClient(async () => Response.json({ error: 'Enter a nickname.' }, { status: 400 }));
  await assert.rejects(invalid.submit('round', '', result()), /Enter a nickname/);
  const offline = new LeaderboardClient(async () => { throw new TypeError('Network'); });
  await assert.rejects(offline.start(), /Could not reach/);
});

test('HTTP boundary issues a private cookie, rejects cross-origin posts, and returns safe errors', async () => {
  const { LeaderboardHandler } = await import('../server/leaderboard-handler.mjs');
  const { service } = fixture(); const handler = new LeaderboardHandler(() => service);
  const url = 'https://controller.example/.netlify/functions/leaderboard';
  const response = await handler.handle(new Request(url));
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.deepEqual(await response.json(), { entries: [] });
  const request = (origin, body) => new Request(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
  assert.equal((await handler.handle(request('https://other.example', '{}'))).status, 403);
  assert.equal((await handler.handle(request('https://controller.example', 'bad json'))).status, 400);
  const ticket = await handler.handle(request('https://controller.example', '{"action":"start"}'));
  assert.equal(ticket.status, 200); assert.equal(typeof (await ticket.json()).roundId, 'string');
  const unavailable = new LeaderboardHandler(() => { throw new Error('SECRET storage credentials'); });
  const failed = await unavailable.handle(new Request(url)); assert.equal(failed.status, 503); assert.equal((await failed.text()).includes('SECRET'), false);
});
