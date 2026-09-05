import { randomUUID } from 'node:crypto';
import { LeaderboardError } from './leaderboard-service.mjs';

export class LeaderboardHandler {
  constructor(createService) { this.createService = createService; }
  async handle(request, context = {}) {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
    if (request.method === 'POST' && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Submit from the controller app.' }, 403);
    let player = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('ds_player='))?.slice(10);
    if (!/^[a-f0-9-]{36}$/.test(player || '')) {
      player = randomUUID();
      headers['Set-Cookie'] = `ds_player=${player}; Path=/.netlify/functions/leaderboard; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`;
    }
    try {
      const service = this.createService();
      if (request.method === 'GET') return reply(await service.list(player));
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Send a JSON request.' }, 415);
      if (Number(request.headers.get('content-length')) > 4096) return reply({ error: 'This submission is too large.' }, 413);
      const text = await request.text();
      if (text.length > 4096) return reply({ error: 'This submission is too large.' }, 413);
      let body; try { body = JSON.parse(text); } catch { return reply({ error: 'Invalid submission.' }, 400); }
      if (!body || !['start', 'submit'].includes(body.action)) return reply({ error: 'Unknown leaderboard action.' }, 400);
      await service.limit(context.ip);
      return reply(body.action === 'start' ? await service.start(player) : await service.submit(player, body.roundId, body.nickname, body.result));
    } catch (error) {
      if (error instanceof LeaderboardError) return reply({ error: error.message }, error.status);
      console.error('Leaderboard storage unavailable');
      return reply({ error: 'The leaderboard is unavailable right now. Your game still works; please try again later.' }, 503);
    }
  }
}
