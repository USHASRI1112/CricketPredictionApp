import { CricketApiEndpoints } from '../constants/Api';
import { Match } from '../types';
import { normalizeLiveScoreWithGroq } from './GroqLiveScore';

const normalize = (value = ''): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

function inferBattingTeam(match: Match, inningLabel: string): string | null {
  const label = normalize(inningLabel);
  const teams = match.teams || [];

  for (const team of teams) {
    const teamNorm = normalize(team);
    if (teamNorm && (label.includes(teamNorm) || teamNorm.includes(label))) {
      return team;
    }
  }

  const tossWinner = normalize(match.tossWinner || '');
  const choice = normalize(match.tossChoice || '');
  if (tossWinner && choice.includes('bowl') && teams.length >= 2) {
    const tossIndex = teams.findIndex(team => normalize(team) === tossWinner);
    if (tossIndex >= 0) {
      return teams.find((_, idx) => idx !== tossIndex) || teams[0] || null;
    }
  }

  return teams[0] || null;
}

export const fetchLiveStatuses = async (
  live: Match[],
): Promise<Match[]> => {
  if (!live || live.length === 0) return [];

  console.log('[LiveStatus] fetch start', {
    liveCount: live.length,
    matchIds: live.map(match => match.id),
  });

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
        if (!remote) {
          console.warn('[LiveStatus] empty remote payload', match.id);
          return null;
        }

        const currentScore = remote.score?.[remote.score.length - 1] || null;
        const currentInningLabel = currentScore?.inning || remote.status || null;
        const inferredBattingTeam = currentInningLabel ? inferBattingTeam(remote, currentInningLabel) : null;
        console.log('[LiveStatus] remote snapshot', {
          matchId: remote.id,
          status: remote.status,
          score: remote.score?.map(s => ({
            inning: s.inning,
            r: s.r,
            w: s.w,
            o: s.o,
          })),
          inferredBattingTeam,
        });

        const groqSnapshot = await normalizeLiveScoreWithGroq(remote);

        const battingTeam = groqSnapshot?.battingTeam?.trim() || inferredBattingTeam;
        const inningLabel =
          groqSnapshot?.inningLabel?.trim() ||
          currentInningLabel ||
          (battingTeam ? `${battingTeam} Inning 1` : null);

        const liveRuns = typeof groqSnapshot?.runs === 'number'
          ? groqSnapshot.runs
          : (currentScore?.r ?? null);
        const liveWickets = typeof groqSnapshot?.wickets === 'number'
          ? groqSnapshot.wickets
          : (currentScore?.w ?? null);
        const liveOvers = typeof groqSnapshot?.overs === 'number'
          ? groqSnapshot.overs
          : (currentScore?.o ?? null);

        return {
          ...remote,
          liveDisplay: {
            battingTeam: battingTeam ?? null,
            runs: liveRuns,
            wickets: liveWickets,
            overs: liveOvers,
            inningLabel,
            status: groqSnapshot?.status ?? remote.status ?? null,
            confidence: groqSnapshot?.confidence ?? 'medium',
          },
          status: groqSnapshot?.status ?? remote.status,
          score: remote.score,
        };
      } catch {
        console.warn('[LiveStatus] fetch error', match.id);
        return null;
      }
    }),
  );

  console.log('[LiveStatus] fetch complete', {
    updatedCount: updates.filter(match => match !== null).length,
  });

  return updates.filter(match => match !== null) as Match[];
};
