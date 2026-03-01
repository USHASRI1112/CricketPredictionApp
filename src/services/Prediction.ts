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
  try {
    console.log("fetching prediction for match", match);
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

    const response = await fetch(CricketApiEndpoints.PREDICT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ data: requestData }),
    });

    const prediction = (await response.json()) as {
      result: PredictionResponse;
    };
    return prediction.result;
  } catch (error) {
    console.error('Error fetching prediction:', error);
    throw new Error('Failed to get prediction. Please try again.');
  }
};
