import { getFirestore, collection, doc, getDoc, onSnapshot } from '@react-native-firebase/firestore';
import { Match } from '../types';

const CACHE_COL       = 'cricket_cache';
const LIVE_SCORES_DOC = 'live_scores';

interface LiveScoreDoc {
  matches:       Match[];
  lastUpdatedAt: number;
  totalLive:     number;
}

const STALE_MS = 10 * 60 * 1000; // 10 minutes

export async function getUpdatedLiveMatches(liveMatches: Match[]): Promise<Match[]> {
  if (!liveMatches || liveMatches.length === 0) { return []; }

  try {
    const db   = getFirestore();
    const snap = await getDoc(doc(db, CACHE_COL, LIVE_SCORES_DOC));

    if (!snap.exists) {
      console.log('[LiveCache] No Firestore data yet');
      return liveMatches;
    }

    const data       = snap.data() as LiveScoreDoc;
    const ageMs      = Date.now() - data.lastUpdatedAt;
    const ageSeconds = Math.round(ageMs / 1000);
    const isStale    = ageMs > STALE_MS;

    console.log(`[LiveCache] Firestore data age: ${ageSeconds}s ${isStale ? '(stale)' : '(fresh)'}`);

    if (!data.matches || data.matches.length === 0) {
      return liveMatches;
    }

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

export function subscribeToLiveScores(
  onUpdate: (matches: Match[]) => void,
): () => void {
  const db = getFirestore();

  const unsub = onSnapshot(
    doc(db, CACHE_COL, LIVE_SCORES_DOC),
    snap => {
      if (!snap.exists) { return; }
      const data = snap.data() as LiveScoreDoc;
      if (data?.matches) {
        console.log(`[LiveCache] Real-time update: ${data.matches.length} live matches`);
        onUpdate(data.matches);
      }
    },
    err => {
      console.warn('[LiveCache] Snapshot error:', err.message);
    }
  );

  return unsub;
}