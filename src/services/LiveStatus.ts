/* eslint-disable @typescript-eslint/no-unused-vars */
import { CricketApiEndpoints } from '../constants/Api';
import { Match } from '../types';

export const fetchLiveStatuses = async (
  live: Match[],
): Promise<Match[]> => {
  if (!live || live.length === 0) return [];

  const updates = await Promise.all(
    live.map(async (match: Match) => {
      try {
        const res = await fetch(CricketApiEndpoints.MATCH_DETAILS(match.id));
        if (!res.ok) return null;
        const body = (await res.json()) as { data: Match };
        const remote = body?.data;
        return remote;
      } catch (e: any) {
        return null;
      }
    }),
  );

  return updates.filter((match): match is Match => match !== null);
};
