import { Match, TeamInfo } from '../types';

const normalize = (value = ''): string =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');

const acronym = (value = ''): string =>
	value
		.split(/\s+/)
		.map(part => part[0] || '')
		.join('')
		.toLowerCase();

const getScore = (teamName: string, info: TeamInfo): number => {
	const teamNorm = normalize(teamName);
	const infoNameNorm = normalize(info.name);
	const infoShortNorm = normalize(info.shortname);
	const teamAcronym = normalize(acronym(teamName));

	if (!teamNorm || (!infoNameNorm && !infoShortNorm)) {
		return -1;
	}

	if (teamNorm === infoNameNorm) {
		return 100;
	}

	if (teamNorm === infoShortNorm || teamAcronym === infoShortNorm) {
		return 95;
	}

	if (infoNameNorm && (teamNorm.includes(infoNameNorm) || infoNameNorm.includes(teamNorm))) {
		return 80;
	}

	if (infoShortNorm && (teamNorm.includes(infoShortNorm) || infoShortNorm.includes(teamNorm))) {
		return 70;
	}

	return -1;
};

const pickTeamInfo = (
	teamName: string,
	teamInfo: TeamInfo[],
	usedIndexes: Set<number>,
	fallbackIndex: number
): TeamInfo | null => {
	let bestIndex = -1;
	let bestScore = -1;

	teamInfo.forEach((info, idx) => {
		if (usedIndexes.has(idx)) {
			return;
		}

		const score = getScore(teamName, info);
		if (score > bestScore) {
			bestScore = score;
			bestIndex = idx;
		}
	});

	if (bestIndex >= 0) {
		usedIndexes.add(bestIndex);
		return teamInfo[bestIndex];
	}

	if (!usedIndexes.has(fallbackIndex) && teamInfo[fallbackIndex]) {
		usedIndexes.add(fallbackIndex);
		return teamInfo[fallbackIndex];
	}

	const firstUnused = teamInfo.findIndex((_, idx) => !usedIndexes.has(idx));
	if (firstUnused >= 0) {
		usedIndexes.add(firstUnused);
		return teamInfo[firstUnused];
	}

	return null;
};

export const resolveMatchTeamFlags = (match: Pick<Match, 'teams' | 'teamInfo'>) => {
	const teamInfo = match.teamInfo || [];
	const teams = match.teams || [];
	const usedIndexes = new Set<number>();

	const team1Info = pickTeamInfo(teams[0] || '', teamInfo, usedIndexes, 0);
	const team2Info = pickTeamInfo(teams[1] || '', teamInfo, usedIndexes, 1);

	return {
		team1Flag: team1Info?.img || null,
		team2Flag: team2Info?.img || null,
	};
};
