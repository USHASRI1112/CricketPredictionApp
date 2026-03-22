import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee ,{AndroidImportance}from '@notifee/react-native';

const FCM_TOKEN_KEY = 'fcm_token';

// ─── Topics ────────────────────────────────────────────────────────────────
// These must exactly match the topic names you send to from Firebase console
// or your backend script. Case sensitive.
export const TOPICS = {
  INDIA_MATCHES: 'india_matches',   // any match India is playing
  IPL_MATCHES:   'ipl_matches',     // IPL tournament games
  LIVE_MATCHES:  'live_matches',    // any match that just went live
  PREDICTIONS:   'predictions_ready', // AI prediction generated
} as const;

// ─── Init: permission + token ──────────────────────────────────────────────
// Call once on app start.
// On Android < 13: permission is auto-granted, no popup shown.
// On Android 13+:  system popup appears asking user to allow notifications.
export async function initPushNotifications(): Promise<string | null> {
  try {
    const authStatus = await messaging().requestPermission();

    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('[FCM] Permission denied by user');
      return null;
    }

    // Get this device's unique FCM token
    const token = await messaging().getToken();
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    console.log('[FCM] Token ready:', token);

    // If token ever rotates (reinstall, etc.), save the new one
    messaging().onTokenRefresh(async newToken => {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
      console.log('[FCM] Token refreshed:', newToken);
    });

    return token;

  } catch (error) {
    console.error('[FCM] Init failed:', error);
    return null;
  }
}

export async function createNotificationChannel(): Promise<void> {
  await notifee.createChannel({
    id:         'cricket_alerts',     // ← must match channelId in index.ts
    name:       'Cricket Alerts',
    importance: AndroidImportance.HIGH,
    sound:      'default',
  });
}

// ─── Get saved token (useful for debugging / sending to backend) ───────────
export async function getSavedToken(): Promise<string | null> {
  return AsyncStorage.getItem(FCM_TOKEN_KEY);
}

// ─── Subscribe to a topic ──────────────────────────────────────────────────
export async function subscribeToTopic(topic: string): Promise<void> {
  try {
    await messaging().subscribeToTopic(topic);
    console.log(`[FCM] Subscribed → ${topic}`);
  } catch (e) {
    console.error(`[FCM] Subscribe failed for ${topic}:`, e);
  }
}

// ─── Unsubscribe from a topic ──────────────────────────────────────────────
// Call this if user toggles off a notification preference in settings
export async function unsubscribeFromTopic(topic: string): Promise<void> {
  try {
    await messaging().unsubscribeFromTopic(topic);
    console.log(`[FCM] Unsubscribed → ${topic}`);
  } catch (e) {
    console.error(`[FCM] Unsubscribe failed for ${topic}:`, e);
  }
}

// ─── Foreground notification listener ─────────────────────────────────────
// Fires when a push arrives while the app is OPEN.
// Android does NOT auto-show a system banner in foreground — you handle it.
// Returns an unsubscribe function — call it in useEffect cleanup.
export function onForegroundNotification(
  callback: (
    title: string,
    body: string,
    data: Record<string, string>
  ) => void
): () => void {
  return messaging().onMessage(async remoteMessage => {
    const title = remoteMessage.notification?.title ?? 'Cricket Predictor';
    const body  = remoteMessage.notification?.body  ?? '';
    const data  = (remoteMessage.data ?? {}) as Record<string, string>;

    console.log('[FCM] Foreground message:', title, body, data);
    callback(title, body, data);
  });
}

// ─── Notification tap handler ──────────────────────────────────────────────
// Fires when user TAPS a system notification.
// Covers two cases:
//   1. App was in background (minimised) — onNotificationOpenedApp
//   2. App was killed — getInitialNotification
// You use the `data` payload to decide where to navigate.
//
// Expected data payload shape from Firebase console / your send script:
//   { screen: 'Match', matchId: 'xyz' }
//   { screen: 'AllMatches' }
export function onNotificationTap(
  callback: (data: Record<string, string>) => void
): void {
  // Case 1: app was in background
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('[FCM] Notification tapped (background):', remoteMessage.data);
    if (remoteMessage?.data) {
      callback(remoteMessage.data as Record<string, string>);
    }
  });

  // Case 2: app was killed — check on startup
  messaging().getInitialNotification().then(remoteMessage => {
    if (remoteMessage?.data) {
      console.log('[FCM] Notification tapped (killed state):', remoteMessage.data);
      callback(remoteMessage.data as Record<string, string>);
    }
  });
}