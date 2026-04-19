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

const scoreTeamAgainstLabel = (teamName: string | undefined, inningLabel: string): number => {
  const normalizedLabel = normalize(inningLabel);
  const normalizedTeam = normalize(teamName);

  if (!normalizedTeam || !normalizedLabel) {
    return -1;
  }

  if (normalizedLabel === normalizedTeam) {
    return 100;
  }

  let score = 0;
  const tokens = getTeamTokens(teamName);

  tokens.forEach(token => {
    if (!token) {
      return;
    }

    if (normalizedLabel === token) {
      score += 30;
      return;
    }

    if (normalizedLabel.includes(token)) {
      score += token === normalizedTeam ? 20 : 8;
    }
  });

  return score > 0 ? score : -1;
};

const parseInning = (inning: any): TeamMappedInning => ({
  label: inning?.inning || inning?.title || '',
  runs: String(inning?.r ?? inning?.runs ?? ''),
  wickets: String(inning?.w ?? inning?.wkts ?? ''),
  overs: String(inning?.o ?? inning?.overs ?? ''),
});

const findTeamIndexByName = (teams: string[], target?: string): number => {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) {
    return -1;
  }

  return teams.findIndex(team => {
    const normalizedTeam = normalize(team);
    return (
      normalizedTeam === normalizedTarget ||
      normalizedTeam.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedTeam)
    );
  });
};

const inferBattingTeamIndex = (
  match: Match,
  inningLabel: string,
  inningIndex: number,
  usedTeamIndexes: Set<number>,
): number | null => {
  const teams = match.teams || [];
  const scoredTeams = teams
    .map((team, index) => ({ index, score: scoreTeamAgainstLabel(team, inningLabel) }))
    .sort((a, b) => b.score - a.score);

  const best = scoredTeams[0];
  const second = scoredTeams[1];

  if (best && best.score >= 0 && (!second || best.score - second.score >= 15)) {
    return best.index;
  }

  const tossWinnerIndex = findTeamIndexByName(teams, match.tossWinner);
  if (inningIndex === 0 && tossWinnerIndex >= 0) {
    const choice = normalize(match.tossChoice);
    if (choice.includes('bowl')) {
      const otherIndex = teams.findIndex((_, index) => index !== tossWinnerIndex && !usedTeamIndexes.has(index));
      if (otherIndex >= 0) {
        return otherIndex;
      }
    }

    if (choice.includes('bat')) {
      return tossWinnerIndex;
    }
  }

  const firstUnused = teams.findIndex((_, index) => !usedTeamIndexes.has(index));
  return firstUnused >= 0 ? firstUnused : null;
};

export const getTeamMappedInnings = (
  match: Match,
): { team1Inning: TeamMappedInning | null; team2Inning: TeamMappedInning | null } => {
  const innings = Array.isArray(match.score) ? (match.score as any[]) : [];
  if (innings.length === 0) {
    return { team1Inning: null, team2Inning: null };
  }

  const teams = match.teams || [];
  const usedTeamIndexes = new Set<number>();
  const mapped: Array<TeamMappedInning | null> = Array.from({ length: teams.length }, () => null);

  innings.forEach((inning, inningIndex) => {
    const inningLabel = inning?.inning || inning?.title || '';
    const teamIndex = inferBattingTeamIndex(match, inningLabel, inningIndex, usedTeamIndexes);

    if (teamIndex === null || teamIndex < 0 || teamIndex >= teams.length) {
      return;
    }

    const targetIndex = mapped[teamIndex] ? mapped.findIndex(item => item === null) : teamIndex;
    if (targetIndex < 0) {
      return;
    }

    mapped[targetIndex] = parseInning(inning);
    usedTeamIndexes.add(teamIndex);
  });

  return {
    team1Inning: mapped[0] || null,
    team2Inning: mapped[1] || null,
  };
};
