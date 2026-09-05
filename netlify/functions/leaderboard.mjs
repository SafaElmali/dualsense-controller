import { getStore } from '@netlify/blobs';
import { LeaderboardService } from '../../server/leaderboard-service.mjs';
import { LeaderboardHandler } from '../../server/leaderboard-handler.mjs';

const handler = new LeaderboardHandler(() => new LeaderboardService(getStore({ name: 'dualsense-leaderboard', consistency: 'strong' })));
export default (request, context) => handler.handle(request, context);
