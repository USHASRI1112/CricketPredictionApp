import { backendUrl } from '../config/Backend';

// Shapes from CricAPI's match_squad / match_scorecard (served and cached by our backend).
export interface SquadPlayer {
  id?: string;
  name?: string;
  role?: string;
  battingStyle?: string;
  bowlingStyle?: string;
}

export interface SquadTeam {
  teamName?: string;
  shortname?: string;
  img?: string;
  players?: SquadPlayer[];
}

export interface BattingRow {
  batsman?: { name?: string };
  'dismissal-text'?: string;
  r?: number | string;
  b?: number | string;
  '4s'?: number | string;
  '6s'?: number | string;
  sr?: number | string;
}

export interface BowlingRow {
  bowler?: { name?: string };
  o?: number | string;
  m?: number | string;
  r?: number | string;
  w?: number | string;
  eco?: number | string;
}

export interface Innings {
  inning?: string;
  batting?: BattingRow[];
  bowling?: BowlingRow[];
}

export interface Scorecard {
  status?: string;
  score?: { inning?: string; r?: number; w?: number; o?: number }[];
  scorecard?: Innings[];
}

export class DetailNotAvailableError extends Error {}

async function fetchDetail<T>(kind: 'scorecard' | 'squad', matchId: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(backendUrl(`/matches/${encodeURIComponent(matchId)}/${kind}`), { signal: controller.signal });
    if (res.status === 404) {
      throw new DetailNotAvailableError(kind === 'squad' ? 'Squads aren\'t announced yet.' : 'Scorecard isn\'t available yet.');
    }
    if (!res.ok) {
      throw new Error('Couldn\'t load right now. Pull to retry.');
    }
    const json = await res.json() as { data?: T };
    if (!json?.data) {
      throw new DetailNotAvailableError('Not available yet.');
    }
    return json.data;
  } catch (error) {
    if (error instanceof DetailNotAvailableError) throw error;
    throw new Error(controller.signal.aborted ? 'Took too long. Pull to retry.' : 'Couldn\'t load right now. Pull to retry.');
  } finally {
    clearTimeout(timeout);
  }
}

export const fetchSquads = (matchId: string) => fetchDetail<SquadTeam[]>('squad', matchId);
export const fetchScorecard = (matchId: string) => fetchDetail<Scorecard>('scorecard', matchId);
