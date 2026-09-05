export class LeaderboardClient {
  constructor(fetcher = (...args) => fetch(...args)) { this.fetcher = fetcher; }
  async request(body) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await this.fetcher('/.netlify/functions/leaderboard', { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The leaderboard is available on the live site. You can still play here.');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The leaderboard is unavailable. Please try again.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the leaderboard. Please try again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  start() { return this.request({ action: 'start' }); }
  submit(roundId, nickname, result) { return this.request({ action: 'submit', roundId, nickname, result }); }
  list() { return this.request(); }
}

export class LeaderboardView {
  constructor({ client, onOpen, onClose, onAction = () => {} }) {
    this.client = client; this.onOpen = onOpen; this.onClose = onClose; this.onAction = onAction;
    this.dialog = document.getElementById('leaderboard'); this.request = 0;
    document.getElementById('leaderboard-close').addEventListener('click', () => this.dialog.close());
    document.getElementById('leaderboard-refresh').addEventListener('click', () => this.load());
    this.dialog.addEventListener('close', () => { this.request++; this.onClose(); });
  }
  get isOpen() { return this.dialog.open; }
  open() { document.getElementById('leaderboard-close').textContent = document.getElementById('range')?.open ? 'Back to game' : 'Back to controller'; this.onOpen(); this.dialog.showModal(); this.onAction('leaderboard', 'opened'); void this.load(); }
  async load() {
    const request = ++this.request;
    const status = document.getElementById('leaderboard-status'), refresh = document.getElementById('leaderboard-refresh');
    status.textContent = 'Loading the leaderboard…'; refresh.disabled = true;
    const body = document.getElementById('leaderboard-rows'); body.replaceChildren();
    try {
      const { entries } = await this.client.list();
      if (request !== this.request || !this.isOpen) return;
      for (const entry of entries) {
        const row = document.createElement('tr'); if (entry.mine) row.className = 'your-score';
        const weapons = entry.weapons.map(mode => ({ shooting: 'Pistol', shotgun: 'Shotgun', lmg: 'LMG', smg: 'SMG' })[mode]).join(' + ');
        for (const value of [entry.rank, entry.nickname + (entry.mine ? ' · You' : ''), entry.score.toLocaleString(), entry.accuracy + '%', weapons]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        body.append(row);
      }
      status.textContent = entries.length ? 'Top 50 · Best submitted score per browser · Ties use accuracy, then earliest submission.' : 'The board is waiting for its first score. Finish a round and claim your place.';
    } catch (error) { if (request === this.request) status.textContent = error.message; }
    finally { if (request === this.request) refresh.disabled = false; }
  }
}
