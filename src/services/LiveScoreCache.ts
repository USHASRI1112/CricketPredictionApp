/**
 * LiveScoreCache.ts
 * Place in: src/services/LiveScoreCache.ts
 *
 * React Native reads live scores FROM Firestore.
 * Never hits cricapi directly — Firebase Function does that.
 *
 * Flow:
 *   getUpdatedLiveMatches(liveMatches)
 *     → reads Firestore live_scores doc
 *     → if fresh (< 2 min) → merge into current matches
 *     → if stale → return as-is (function will update soon)
 */

import firestore from '@react-native-firebase/firestore';
import { Match } from '../types';

const CACHE_COL       = 'cricket_cache';
const LIVE_SCORES_DOC = 'live_scores';

interface LiveScoreDoc {
  matches:       Match[];
  lastUpdatedAt: number;
  totalLive:     number;
}

// Freshness threshold — if Firestore data is older than this, it's stale
// Function updates every 2 min during IPL, every 15 min outside
// We show data even if slightly stale — function will refresh soon
const STALE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * getUpdatedLiveMatches
 *
 * Reads Firestore for latest live scores.
 * Merges scores into your existing live match list by id.
 * Returns original list if Firestore read fails (safe fallback).
 */
export async function getUpdatedLiveMatches(liveMatches: Match[]): Promise<Match[]> {
  if (!liveMatches || liveMatches.length === 0) { return []; }

  try {
    const snap = await firestore()
      .collection(CACHE_COL)
      .doc(LIVE_SCORES_DOC)
      .get();

    if (!snap.exists) {
      console.log('[LiveCache] No Firestore data yet');
      return liveMatches;
    }

    const data          = snap.data() as LiveScoreDoc;
    const ageMs         = Date.now() - data.lastUpdatedAt;
    const ageSeconds    = Math.round(ageMs / 1000);
    const isStale       = ageMs > STALE_MS;

    console.log(`[LiveCache] Firestore data age: ${ageSeconds}s ${isStale ? '(stale)' : '(fresh)'}`);

    if (!data.matches || data.matches.length === 0) {
      return liveMatches;
    }

    // Merge Firestore scores into live matches by id
    const updated = liveMatches.map(match => {
      const fresh = data.matches.find(m => m.id === match.id);
      if (!fresh) { return match; }
      return {
        ...match,
        status:       fresh.status       ?? match.status,
        score:        fresh.score        ?? match.score,
        matchEnded:   fresh.matchEnded   ?? match.matchEnded,
        matchStarted: fresh.matchStarted ?? match.matchStarted,
      };
    });

    console.log(`[LiveCache] Merged scores for ${updated.length} live matches`);
    return updated;

  } catch (e: any) {
    console.warn('[LiveCache] Firestore read failed — using existing data:', e.message);
    return liveMatches;
  }
}

/**
 * subscribeToLiveScores
 *
 * Real-time listener — updates UI automatically when
 * Firebase Function writes new scores to Firestore.
 * Use this for truly live updates without polling.
 *
 * Usage:
 *   const unsub = subscribeToLiveScores((matches) => {
 *     setLiveMatches(matches);
 *   });
 *   // Call unsub() to stop listening
 */
export function subscribeToLiveScores(
  onUpdate: (matches: Match[]) => void,
): () => void {
  const unsub = firestore()
    .collection(CACHE_COL)
    .doc(LIVE_SCORES_DOC)
    .onSnapshot(snap => {
      if (!snap.exists) { return; }
      const data = snap.data() as LiveScoreDoc;
      if (data?.matches) {
        console.log(`[LiveCache] Real-time update: ${data.matches.length} live matches`);
        onUpdate(data.matches);
      }
    }, err => {
      console.warn('[LiveCache] Snapshot error:', err.message);
    });

  return unsub; // call this to unsubscribe
}