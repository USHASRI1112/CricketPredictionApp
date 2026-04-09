import { CricketApiEndpoints } from '../constants/Api';
import { Match } from '../types';

export const fetchLiveStatuses = async (
  live: Match[],
): Promise<Match[]> => {
  if (!live || live.length === 0) return [];

  const updates = await Promise.all(
    live.map(async (match: Match) => {
      try {
        const cacheBust = Date.now();
        const detailsUrl = `${CricketApiEndpoints.MATCH_DETAILS(match.id)}&_=${cacheBust}`;

        const res = await fetch(detailsUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });

        if (!res.ok) return null;
        const body = (await res.json()) as { data: Match };
        const remote = body?.data;
        return remote;
      } catch {
        return null;
      }
    }),
  );

  return updates.filter((match): match is Match => match !== null);
};
