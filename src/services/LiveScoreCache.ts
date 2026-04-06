import { getFirestore, doc, getDoc, onSnapshot } from '@react-native-firebase/firestore';
import { Match } from '../types';

const CACHE_COL = 'cricket_cache';
const LIVE_SCORES_DOC = 'live_scores';

interface LiveScoreDoc {
  matches: Match[];
  lastUpdatedAt: number;
  totalLive: number;
}

const PREMIUM_END = new Date('2026-05-05T23:59:59+05:30');

function isPremiumMode(): boolean {
  return new Date() <= PREMIUM_END;
}

const STALE_MS = isPremiumMode()
  ? 30 * 1000
  : 10 * 60 * 1000;

export async function getUpdatedLiveMatches(liveMatches: Match[]): Promise<Match[]> {
  if (!liveMatches || liveMatches.length === 0) { return []; }

  try {
    console.info('[LiveCache] getUpdatedLiveMatches start', { incoming: liveMatches.length });
    const db = getFirestore();
    const snap = await getDoc(doc(db, CACHE_COL, LIVE_SCORES_DOC));

    if (!snap.exists) {
      console.warn('[LiveCache] no Firestore data yet');
      return liveMatches;
    }

    const data = snap.data() as LiveScoreDoc;
    const ageMs = Date.now() - data.lastUpdatedAt;
    const ageSeconds = Math.round(ageMs / 1000);
    const isStale = ageMs > STALE_MS;

    console.info('[LiveCache] firestore snapshot meta', {
      ageSeconds,
      isStale,
      mode: isPremiumMode() ? 'PREMIUM' : 'NORMAL',
      totalLive: data.totalLive,
      hasMatches: !!data.matches?.length,
    });

    if (!data.matches || data.matches.length === 0) {
      console.warn('[LiveCache] snapshot has no matches');
      return liveMatches;
    }

    const updated = liveMatches.map(match => {
      const fresh = data.matches.find(m => m.id === match.id);
      if (!fresh) { return match; }
      console.info('[LiveCache] merging match', {
        id: match.id,
        prevStatus: match.status,
        freshStatus: fresh.status,
        prevEnded: match.matchEnded,
        freshEnded: fresh.matchEnded,
      });
      return {
        ...match,
        status: fresh.status ?? match.status,
        score: fresh.score ?? match.score,
        matchEnded: fresh.matchEnded ?? match.matchEnded,
        matchStarted: fresh.matchStarted ?? match.matchStarted,
      };
    });

    console.info('[LiveCache] getUpdatedLiveMatches done', { updated: updated.length });
    return updated;

  } catch (e: any) {
    console.error('[LiveCache] getUpdatedLiveMatches failed', e?.message || e);
    return liveMatches;
  }
}

export function subscribeToLiveScores(
  onUpdate: (matches: Match[]) => void,
): () => void {
  console.info('[LiveCache] subscribeToLiveScores start');
  const db = getFirestore();

  const unsub = onSnapshot(
    doc(db, CACHE_COL, LIVE_SCORES_DOC),
    snap => {
      if (!snap.exists) {
        console.warn('[LiveCache] snapshot received but doc missing');
        return;
      }
      const data = snap.data() as LiveScoreDoc;
      if (data?.matches) {
        console.info('[LiveCache] snapshot update', {
          matches: data.matches.length,
          totalLive: data.totalLive,
          lastUpdatedAt: data.lastUpdatedAt,
          ids: data.matches.slice(0, 5).map(m => m.id),
        });
        onUpdate(data.matches);
      }
    },
    err => {
      console.error('[LiveCache] snapshot error', err?.message || err);
    }
  );

  return () => {
    console.info('[LiveCache] unsubscribeToLiveScores');
    unsub();
  };
}
