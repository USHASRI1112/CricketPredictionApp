import { Checkpoint,TestInfo } from "../types";

const T20_CHECKPOINTS = [
  { overs: 6,  label: '6 ov',  phase: 'Powerplay'        },
  { overs: 10, label: '10 ov', phase: 'Halfway'           },
  { overs: 15, label: '15 ov', phase: 'Death Overs Start' },
  { overs: 20, label: '20 ov', phase: 'Final'             },
];

const ODI_CHECKPOINTS = [
  { overs: 10, label: '10 ov', phase: 'Powerplay 1'       },
  { overs: 20, label: '20 ov', phase: 'Second Milestone'  },
  { overs: 30, label: '30 ov', phase: 'Middle Milestone'  },
  { overs: 35, label: '35 ov', phase: 'Middle Phase End'  },
  { overs: 40, label: '40 ov', phase: 'Slog Overs Start'  },
  { overs: 50, label: '50 ov', phase: 'Final'             },
];

const T10_CHECKPOINTS = [
  { overs: 3,  label: '3 ov',  phase: 'Powerplay' },
  { overs: 5,  label: '5 ov',  phase: 'Halfway'   },
  { overs: 10, label: '10 ov', phase: 'Final'      },
];


export type ProjectionResult =
  | { type: 't20';   data: Checkpoint[] }
  | { type: 'odi';   data: Checkpoint[] }
  | { type: 't10';   data: Checkpoint[] }
  | { type: 'test';  data: TestInfo     }
  | null;

function toDecimalOvers(o: number): number {
  const full = Math.floor(o);
  const balls = Math.round((o - full) * 10);
  return full + balls / 6;
}

function wicketPenalty(w: number, matchType: 't20' | 'odi' | 't10'): number {
  switch (matchType) {
    case 't10': return 1 - w * 0.015;
    case 't20': return 1 - w * 0.02;
    case 'odi': return 1 - w * 0.025;
  }
}


function projectCheckpoints(
  r: number,
  w: number,
  o: number,
  checkpoints: { overs: number; label: string; phase: string }[],
  matchType: 't20' | 'odi' | 't10',
  maxScore: number,
  currentWindow: number, // overs window to mark as "current"
): Checkpoint[] {
  const decOvers = toDecimalOvers(o);
  if (decOvers === 0) return [];

  const crr     = r / decOvers;
  const penalty = wicketPenalty(w, matchType);

  return checkpoints.map(cp => {
    const remainingOvers = cp.overs - decOvers;
    const isPast         = decOvers > cp.overs;
    const isCurrent      = !isPast && decOvers >= cp.overs - currentWindow;
    const projected      = isPast
      ? r
      : Math.round(r + crr * remainingOvers * penalty);

    return {
      label:     cp.label,
      overs:     cp.overs,
      phase:     cp.phase,
      projected: Math.min(projected, maxScore),
      isPast,
      isCurrent,
      type: matchType
    };
  });
}


export function getT20Projections(r: number, w: number, o: number): Checkpoint[] {
  return projectCheckpoints(r, w, o, T20_CHECKPOINTS, 't20', 300, 1);
}

// ── ODI ────────────────────────────────────────────────────
export function getODIProjections(r: number, w: number, o: number): Checkpoint[] {
  return projectCheckpoints(r, w, o, ODI_CHECKPOINTS, 'odi', 500, 5);
}

// ── T10 ────────────────────────────────────────────────────
export function getT10Projections(r: number, w: number, o: number): Checkpoint[] {
  return projectCheckpoints(r, w, o, T10_CHECKPOINTS, 't10', 150, 1);
}


function getTestSession(decOvers: number): string {
  const oversInDay = decOvers % 90;
  if (oversInDay < 30) return 'Session 1 — Pre Lunch';
  if (oversInDay < 60) return 'Session 2 — Post Lunch';
  return 'Session 3 — Post Tea';
}



export function getTestInfo(r: number, w: number, o: number): TestInfo {
  const decOvers = toDecimalOvers(o);
  if (decOvers === 0) {
    return { crr: 0, session: 'Session 1 — Pre Lunch', runsToLunch: 0, runsToTea: 0, runsToStumps: 0 };
  }

  const crr     = r / decOvers;
  const penalty = 1 - w * 0.01;
  const session = getTestSession(decOvers);

  // overs remaining to each session break within the current day
  const oversInDay      = decOvers % 90;
  const toLunch         = Math.max(0, 30 - oversInDay);
  const toTea           = Math.max(0, 60 - oversInDay);
  const toStumps        = Math.max(0, 90 - oversInDay);

  return {
    crr:          Math.round(crr * 100) / 100,
    session,
    runsToLunch:  Math.round(crr * toLunch  * penalty),
    runsToTea:    Math.round(crr * toTea    * penalty),
    runsToStumps: Math.round(crr * toStumps * penalty),
  };
}



export function getProjectedScore(
  score: { r: number; w: number; o: number },
  matchType: string,
): ProjectionResult {
  const type = matchType.toLowerCase();

  if (type === 't20')  return { type: 't20',  data: getT20Projections(score.r, score.w, score.o) };
  if (type === 'odi')  return { type: 'odi',  data: getODIProjections(score.r, score.w, score.o) };
  if (type === 't10')  return { type: 't10',  data: getT10Projections(score.r, score.w, score.o) };
  if (type === 'test') return { type: 'test', data: getTestInfo(score.r, score.w, score.o)       };

  return null; // "other" match type — no projection
}