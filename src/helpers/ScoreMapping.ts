import { Match } from '../types';

export interface TeamMappedInning {
  label: string;
  runs: string;
  wickets: string;
  overs: string;
}

const normalize = (value?: string): string =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getTeamTokens = (teamName?: string): string[] => {
  const normalized = normalize(teamName);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(' ').filter(word => word.length >= 3);
  const shortCode = words.map(word => word[0]).join('');

  return Array.from(new Set([normalized, ...words, shortCode])).filter(Boolean);
};

const parseInning = (inning: any): TeamMappedInning => ({
  label: inning?.inning || inning?.title || '',
  runs: String(inning?.r ?? inning?.runs ?? ''),
  wickets: String(inning?.w ?? inning?.wkts ?? ''),
  overs: String(inning?.o ?? inning?.overs ?? ''),
});

const findInningForTeam = (
  teamName: string | undefined,
  innings: any[],
  usedIndexes: Set<number>,
): TeamMappedInning | null => {
  const tokens = getTeamTokens(teamName);

  for (let i = 0; i < innings.length; i += 1) {
    if (usedIndexes.has(i)) {
      continue;
    }

    const inningLabel = normalize(innings[i]?.inning || innings[i]?.title || '');
    if (!inningLabel) {
      continue;
    }

    if (tokens.some(token => token && inningLabel.includes(token))) {
      usedIndexes.add(i);
      return parseInning(innings[i]);
    }
  }

  for (let i = 0; i < innings.length; i += 1) {
    if (!usedIndexes.has(i)) {
      usedIndexes.add(i);
      return parseInning(innings[i]);
    }
  }

  return null;
};

export const getTeamMappedInnings = (
  match: Match,
): { team1Inning: TeamMappedInning | null; team2Inning: TeamMappedInning | null } => {
  const innings = Array.isArray(match.score) ? match.score : [];
  if (innings.length === 0) {
    return { team1Inning: null, team2Inning: null };
  }

  const usedIndexes = new Set<number>();
  const team1Inning = findInningForTeam(match.teams?.[0], innings, usedIndexes);
  const team2Inning = findInningForTeam(match.teams?.[1], innings, usedIndexes);

  return { team1Inning, team2Inning };
};