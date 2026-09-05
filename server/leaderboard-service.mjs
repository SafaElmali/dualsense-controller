import { randomUUID, createHash } from 'node:crypto';

export class LeaderboardError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export class LeaderboardService {
  constructor(store, { now = Date.now, uuid = randomUUID } = {}) { this.store = store; this.now = now; this.uuid = uuid; }

  async change(key, transform) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.store.getWithMetadata(key, { type: 'json' });
      const next = transform(current?.data ?? null);
      const { modified } = await this.store.setJSON(key, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      if (modified) return next;
    }
    throw new LeaderboardError('The leaderboard is busy. Please try again.', 503);
  }

  async limit(ip) {
    if (!ip) return;
    const key = 'limits/' + createHash('sha256').update(ip).digest('hex');
    const now = this.now();
    await this.change(key, current => {
      const window = current && now - current.start < 3600000 ? current : { start: now, count: 0 };
      if (window.count >= 180) throw new LeaderboardError('Too many requests. Please try again later.', 429);
      return { start: window.start, count: window.count + 1 };
    });
  }

  async start(player) {
    const now = this.now(), id = this.uuid();
    await this.change('players/20-second/' + player, current => {
      if (current?.round && now - current.round.startedAt < 3000) throw new LeaderboardError('Wait a moment before starting another round.', 429);
      return { round: { id, startedAt: now } };
    });
    return { roundId: id };
  }

  validate(nickname, result) {
    if (typeof nickname !== 'string') throw new LeaderboardError('Enter a nickname.');
    const name = nickname.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(name)) throw new LeaderboardError('Use 2–20 letters, numbers, spaces, dashes, or underscores.');
    if (!result || !['score', 'hits', 'shots'].every(key => Number.isInteger(result[key]))) throw new LeaderboardError('This round has invalid results.');
    const { score, hits, shots, weapons } = result;
    if (shots < 1 || shots > 900 || hits < 0 || hits > shots || score < hits * 50 || score > hits * 150 || score % 10 !== 0) throw new LeaderboardError('This round has invalid results.');
    if (!Array.isArray(weapons) || weapons.length < 1 || weapons.length > 4 || new Set(weapons).size !== weapons.length || !weapons.every(mode => ['shooting', 'shotgun', 'lmg', 'smg'].includes(mode))) throw new LeaderboardError('This round has invalid weapons.');
    return { nickname: name, score, hits, shots, weapons: [...weapons] };
  }

  static compare(a, b) { return b.score - a.score || (b.hits / b.shots) - (a.hits / a.shots) || a.submittedAt - b.submittedAt || a.player.localeCompare(b.player); }

  async submit(player, roundId, nickname, result) {
    if (typeof roundId !== 'string') throw new LeaderboardError('Start a new round to join the leaderboard.');
    const checked = this.validate(nickname, result), now = this.now();
    const saved = await this.change('players/20-second/' + player, current => {
      if (!current?.round || current.round.id !== roundId) throw new LeaderboardError('This round is no longer available. Play a new round to submit.', 409);
      if (current.round.entry) return current; // Retried requests cannot alter a submitted round.
      const age = now - current.round.startedAt;
      if (age < 20000 || age > 3600000) throw new LeaderboardError('Finish a new 20-second round before submitting.', 409);
      return { round: { ...current.round, entry: { ...checked, player, submittedAt: now } } };
    });
    const entry = saved.round.entry;
    const board = await this.change('board/20-second-v1', current => {
      const entries = current?.entries ?? [];
      const best = entries.find(row => row.player === player);
      if (best && LeaderboardService.compare(best, entry) <= 0) return { entries };
      return { entries: [...entries.filter(row => row.player !== player), entry].sort(LeaderboardService.compare).slice(0, 100) };
    });
    const rank = board.entries.findIndex(row => row.player === player) + 1;
    return { rank: rank || null, improved: board.entries.some(row => row.player === player && row.submittedAt === entry.submittedAt) };
  }

  async list(player) {
    const board = await this.store.get('board/20-second-v1', { type: 'json' });
    return { entries: (board?.entries ?? []).slice(0, 50).map(({ player: owner, nickname, score, hits, shots, weapons }, index) => ({ rank: index + 1, nickname, score, accuracy: Math.round(hits / shots * 100), weapons, mine: owner === player })) };
  }
}
