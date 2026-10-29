import { CricketApiEndpoints } from '../constants/Api';
import { Match } from '../types';

export interface PredictionRequest {
  matchId: string;
  teamA: string;
  teamB: string;
  date: string;
  tournament?: string;
  matchType?: string;
  venue: string;
  status: string;
  matchEnded: boolean;
  scoreText?: string;
}

export interface PredictionResponse {
  winner: string;
  confidence: 'Low' | 'Medium' | 'High' | 'Actual';
  reason: string;
}

export const fetchPrediction = async (
  match: Match,
): Promise<PredictionResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    // console.log("fetching prediction for match", match);
    let scoreText = '';
    if (match.score && match.score.length > 0) {
      scoreText = match.score
        .map(s => `${s.inning}: ${s.r}/${s.w} (${s.o} overs)`)
        .join(', ');
    }
    const requestData: PredictionRequest = {
      matchId: match.id,
      teamA: match.teams[0] || 'Team A',
      teamB: match.teams[1] || 'Team B',
      date: match.date,
      tournament: match.name,
      matchType: match.matchType || 'unknown',
      venue: match.venue,
      status: match.status,
      matchEnded: match.matchEnded || false,
      scoreText,
    };

    const response = await fetch(CricketApiEndpoints.PREDICT(), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ data: requestData }),
    });

    if (!response.ok) {
      throw new Error('Prediction request failed');
    }
    const payload: unknown = await response.json();
    const result = payload && typeof payload === 'object' && 'result' in payload
      ? (payload as { result: unknown }).result : null;
    if (!result || typeof result !== 'object' ||
        !('winner' in result) || typeof result.winner !== 'string' || !result.winner.trim() ||
        !('reason' in result) || typeof result.reason !== 'string' || !result.reason.trim() ||
        !('confidence' in result) || typeof result.confidence !== 'string' ||
        !['Low', 'Medium', 'High', 'Actual'].includes(result.confidence)) {
      throw new Error('Invalid prediction response');
    }
    return result as PredictionResponse;
  } catch (error) {
    console.error('Error fetching prediction:', error);
    throw new Error(controller.signal.aborted
      ? 'Prediction took too long. Please try again.'
      : 'Failed to get prediction. Please try again.');
  } finally {
    clearTimeout(timeout);
  }
};
