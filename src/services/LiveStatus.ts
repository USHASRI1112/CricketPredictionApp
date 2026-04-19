import { Match } from '../types';

export const fetchLiveStatuses = async (
  live: Match[],
): Promise<Match[]> => {
  // Live score fetching is intentionally disabled in this branch.
  // Keep the function in place so older call sites fail safely and the
  // app can still classify matches as ended from the list endpoints.
  if (!live || live.length === 0) return [];
  return [];
};
