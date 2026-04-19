import { CLIENT_SECRETS } from '../config/clientSecrets';
import { Match } from '../types';

export interface GroqLiveScoreSnapshot {
  battingTeam?: string | null;
  runs?: number | null;
  wickets?: number | null;
  overs?: number | null;
  inningLabel?: string | null;
  status?: string | null;
  confidence?: 'high' | 'medium' | 'low';
}

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function buildPrompt(match: Match): string {
  const payload = {
    id: match.id,
    name: match.name,
    matchType: match.matchType,
    status: match.status,
    venue: match.venue,
    date: match.date,
    dateTimeGMT: match.dateTimeGMT,
    teams: match.teams,
    tossWinner: match.tossWinner,
    tossChoice: match.tossChoice,
    score: match.score,
    scorecard: match.scorecard,
  };

  return [
    'You are given a live cricket match JSON payload from an API.',
    'Your job is to normalize the latest live score from the payload.',
    'Use the innings label, scorecard, and toss information to decide the batting team.',
    'Do not invent a score that is not present in the JSON.',
    'Return ONLY valid JSON with this exact shape:',
    '{"battingTeam":"string or null","runs":0,"wickets":0,"overs":0,"inningLabel":"string or null","status":"string or null","confidence":"high|medium|low"}',
    'Rules:',
    '- If the payload has one score entry, use it.',
    '- If the innings label names a team, use that team as battingTeam.',
    '- If the inning label is ambiguous, use tossWinner/tossChoice and team order to infer battingTeam.',
    '- Preserve the numeric runs, wickets, and overs from the payload.',
    '- If you cannot confidently determine battingTeam, return null for battingTeam and low confidence.',
    'Payload:',
    JSON.stringify(payload),
  ].join('\n');
}

export async function normalizeLiveScoreWithGroq(match: Match): Promise<GroqLiveScoreSnapshot | null> {
  const apiKey = CLIENT_SECRETS.groqApiKey?.trim();
  if (!apiKey) {
    console.log('[GroqLiveScore] skipped - missing Groq API key', match.id);
    return null;
  }

  try {
    console.log('[GroqLiveScore] request start', {
      matchId: match.id,
      teams: match.teams,
      status: match.status,
      currentScore: match.score?.map(s => ({
        inning: s.inning,
        r: s.r,
        w: s.w,
        o: s.o,
      })),
    });

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You normalize cricket live-score JSON.' },
          { role: 'user', content: buildPrompt(match) },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.warn('[GroqLiveScore] request failed', {
        matchId: match.id,
        status: response.status,
      });
      return null;
    }

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[GroqLiveScore] empty response content', { matchId: match.id });
      return null;
    }

    const parsed = JSON.parse(extractJsonObject(content)) as GroqLiveScoreSnapshot;
    console.log('[GroqLiveScore] response ok', {
      matchId: match.id,
      battingTeam: parsed.battingTeam,
      runs: parsed.runs,
      wickets: parsed.wickets,
      overs: parsed.overs,
      confidence: parsed.confidence,
    });
    return parsed;
  } catch {
    console.warn('[GroqLiveScore] request error', match.id);
    return null;
  }
}
