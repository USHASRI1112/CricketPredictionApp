import { getFirestore, doc, setDoc } from '@react-native-firebase/firestore';

const CACHE_COL    = 'cricket_cache';
const ACTIVITY_DOC = 'user_activity';

export async function recordUserActivity(): Promise<void> {
  try {
    const db = getFirestore();
    await setDoc(
      doc(db, CACHE_COL, ACTIVITY_DOC),
      { lastActiveAt: Date.now() },
      { merge: true }
    );
    // console.log('[Activity] Recorded user activity');
  } catch (e) {
    console.warn('[Activity] Failed to record:', e);
  }
}