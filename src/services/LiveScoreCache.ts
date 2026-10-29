import { Match } from '../types';



export async function getUpdatedLiveMatches(liveMatches: Match[]): Promise<Match[]> {
  // Firestore live-score sync is disabled in this branch.
  if (!liveMatches || liveMatches.length === 0) { return []; }
  return liveMatches;
}


export function subscribeToLiveScores(
  onUpdate: (matches: Match[]) => void,
): () => void {
  void onUpdate;
  return () => undefined;
}
