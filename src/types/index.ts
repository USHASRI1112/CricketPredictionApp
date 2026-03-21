export interface MatchResponse {
  status: 'success' | 'failure';
  data: Match[];
}

export interface Match {
  id: string;
  name: string;
  matchType?: MatchType;
  status: string;
  venue: string;
  date: string; // Format is YYYY-MM-DD
  dateTimeGMT: string; // ISO Date
  teams: string[]; //In APi - we are getting array of length 1 sometimes - due to other team not confirming.
  teamInfo?: TeamInfo[];
  series_id: string;
  series?: string; // optional series name (added to match HomeScreen usage)
  fantasyEnabled?: boolean;
  bbbEnabled?: boolean;
  hasSquad?: boolean;
  matchStarted?: boolean;
  matchEnded?: boolean;
  score?: InningScore[];
}

export interface TeamInfo {
  name: string;
  shortname: string;
  img: string;
}

export interface InningScore {
  inning: string;
  r: number;
  w: number;
  o: number;
}

export type MatchType = 't20' | 'odi' | 'test' | 't10' | 'other' | string;

export interface PredictionResult {
  matchId: string;
  teamA: string;
  teamB: string;
  predictedWinner: string;
  confidence?: 'low' | 'medium' | 'high';
  matchDate: string;
}

export interface MatchDetails {
  id: string;
  teamA: string;
  teamB: string;
  name: string;
  matchType?: MatchType;
  status: string;
  venue: string;
  dateTimeGMT: string;
  matchStarted?: boolean;
  matchEnded?: boolean;
}

export interface Country {
  name: string;
  code: string;
  flag: string;
}


export interface Checkpoint {
  label:     string;
  overs:     number;
  phase:     string;
  projected: number;
  isPast:    boolean;
  isCurrent: boolean;
}


export interface TestInfo {
  crr:             number;
  session:         string;
  runsToLunch:     number; // projected runs to lunch (~30 ov)
  runsToTea:       number; // projected runs to tea  (~60 ov)
  runsToStumps:    number; // projected runs to stumps (~90 ov)
}


