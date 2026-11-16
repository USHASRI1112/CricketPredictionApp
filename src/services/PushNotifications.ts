import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  subscribeToTopic,
  unsubscribeFromTopic,
  requestPermission,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance, AuthorizationStatus as NotifeeAuthorizationStatus } from '@notifee/react-native';
import { Platform } from 'react-native';

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

export async function ensureAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus >= NotifeeAuthorizationStatus.AUTHORIZED) {
      return true;
    }

    const updatedSettings = await notifee.requestPermission();
    return updatedSettings.authorizationStatus >= NotifeeAuthorizationStatus.AUTHORIZED;
  } catch (error) {
    console.error('[FCM] Android notification permission check failed:', error);
    return false;
  }
}

// ─── Init: permission + token ──────────────────────────────────────────────
// Call once on app start.
// On Android < 13: permission is auto-granted, no popup shown.
// On Android 13+:  system popup appears asking user to allow notifications.
export async function initPushNotifications(): Promise<string | null> {
  try {
    const messaging = getMessaging();
    let enabled = true;

    if (Platform.OS === 'android') {
      enabled = await ensureAndroidNotificationPermission();
    } else {
      const authStatus = await requestPermission(messaging);
      enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;
    }

    if (!enabled) {
      // console.log('[FCM] Permission denied by user');
      return null;
    }

    // Get this device's unique FCM token
    const token = await getToken(messaging);
    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    // console.log('[FCM] Token ready:', token);

    // If token ever rotates (reinstall, etc.), save the new one
    onTokenRefresh(messaging, async newToken => {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
      // console.log('[FCM] Token refreshed:', newToken);
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

export async function showForegroundNotification(
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<void> {
  try {
    await notifee.displayNotification({
      title,
      body,
      data,
      android: {
        channelId: 'cricket_alerts',
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'default',
        },
      },
    });
  } catch (error) {
    console.error('[FCM] Failed to show foreground notification:', error);
  }
}

// ─── Get saved token (useful for debugging / sending to backend) ───────────
export async function getSavedToken(): Promise<string | null> {
  return AsyncStorage.getItem(FCM_TOKEN_KEY);
}

// ─── Subscribe to a topic ──────────────────────────────────────────────────
export async function subscribeToTopicHandler(topic: string): Promise<void> {
  try {
    await subscribeToTopic(getMessaging(), topic);
    // console.log(`[FCM] Subscribed → ${topic}`);
  } catch (e) {
    // console.error(`[FCM] Subscribe failed for ${topic}:`, e);
  }
}

// ─── Unsubscribe from a topic ──────────────────────────────────────────────
// Call this if user toggles off a notification preference in settings
export async function unsubscribeFromTopicHandler(topic: string): Promise<void> {
  try {
    await unsubscribeFromTopic(getMessaging(), topic);
    // console.log(`[FCM] Unsubscribed → ${topic}`);
  } catch (e) {
    // console.error(`[FCM] Unsubscribe failed for ${topic}:`, e);
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
  const messaging = getMessaging();
  return onMessage(messaging, async remoteMessage => {
    const title = remoteMessage.notification?.title ?? 'Cricket Predictor';
    const body  = remoteMessage.notification?.body  ?? '';
    const data  = (remoteMessage.data ?? {}) as Record<string, string>;

    // console.log('[FCM] Foreground message:', title, body, data);
    callback(title, body, data);
  });
}

// Notification taps are handled in NotificationTaps.ts (registered from index.js).
// Expected data payload: { screen: 'Match', matchId: 'xyz', type, [matchEnded, status] }
