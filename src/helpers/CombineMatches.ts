import { Match } from '../types';

export const isToday = (dateStr: string): boolean => {
  const today = new Date();
  const matchDate = new Date(dateStr);

  return (
    today.getFullYear() === matchDate.getFullYear() &&
    today.getMonth() === matchDate.getMonth() &&
    today.getDate() === matchDate.getDate()
  );
};

const isValidMatch = (match: Match): boolean => {
  if (!match.teams || match.teams.length < 2) return false;

  const teamsValid =
    match.teams.length === 2 &&
    !match.teams.some(t => t.toLowerCase() === 'tbc');

  return teamsValid;
};

export const combineMatches = (
  allMatches: Match[],
  currentMatches: Match[],
): Match[] => {
  const upcomingMatches = allMatches.filter(
    m => !m.matchStarted && !isToday(m.date),
  );
  const mergedMatches = [
    ...currentMatches,
    ...upcomingMatches.filter(m => !currentMatches.some(c => c.id === m.id)),
  ];
  const validMatches = mergedMatches.filter(isValidMatch);
  return validMatches;
};
