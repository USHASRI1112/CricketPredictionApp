/**
 * UserActivity.ts
 * Place in: src/services/UserActivity.ts
 *
 * Records a timestamp to Firestore when user opens the app.
 * Firebase Function checks this before polling cricapi —
 * if no recent activity → skip the API call entirely.
 *
 * No user data stored — just a timestamp.
 */

import firestore from '@react-native-firebase/firestore';

const CACHE_COL    = 'cricket_cache';
const ACTIVITY_DOC = 'user_activity';

export async function recordUserActivity(): Promise<void> {
  try {
    await firestore()
      .collection(CACHE_COL)
      .doc(ACTIVITY_DOC)
      .set({ lastActiveAt: Date.now() }, { merge: true });
    console.log('[Activity] Recorded user activity');
  } catch (e) {
    // Silent fail — never block the UI for this
    console.warn('[Activity] Failed to record:', e);
  }
}