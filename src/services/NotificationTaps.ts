import {
  getInitialNotification,
  getMessaging,
  onNotificationOpenedApp,
} from '@react-native-firebase/messaging';
import notifee, { Event, EventType } from '@notifee/react-native';

// Every way a notification tap can reach the app, funnelled into one place:
//   • FCM system notification, app in background → onNotificationOpenedApp
//   • FCM system notification, app was killed     → getInitialNotification
//   • notifee banner we showed while the app was open (tapped in foreground,
//     background or after the app was killed)       → notifee events / initial
// Registered from index.js at startup, so taps are never lost to a slow or
// failed permission/token setup. A tap that arrives before the App listens is
// queued and delivered when it subscribes.

export type TapData = Record<string, string>;
type Listener = (data: TapData) => void;

const handledIds = new Set<string>();
let listener: Listener | null = null;
let pending: TapData | null = null;
let registered = false;

function emit(id: string | undefined, data: Record<string, unknown> | undefined): void {
  if (!data) { return; }
  // The same tap can be reported twice (e.g. a notifee background event and then
  // getInitialNotification), so each notification is handled once.
  if (id) {
    if (handledIds.has(id)) { return; }
    handledIds.add(id);
  }
  const tap: TapData = {};
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'string') { tap[key] = value; }
  });
  if (listener) {
    listener(tap);
  } else {
    pending = tap; // only the latest tap matters
  }
}

function onNotifeeEvent({ type, detail }: Event): void {
  if (type === EventType.PRESS) {
    emit(detail.notification?.id && `notifee:${detail.notification.id}`, detail.notification?.data);
  }
}

export function registerNotificationTapSources(): void {
  if (registered) { return; }
  registered = true;
  const messaging = getMessaging();

  onNotificationOpenedApp(messaging, message => {
    emit(message.messageId && `fcm:${message.messageId}`, message.data);
  });
  getInitialNotification(messaging)
    .then(message => {
      if (message) { emit(message.messageId && `fcm:${message.messageId}`, message.data); }
    })
    .catch(() => undefined);

  notifee.onForegroundEvent(onNotifeeEvent);
  notifee.onBackgroundEvent(async event => onNotifeeEvent(event));
  notifee.getInitialNotification()
    .then(initial => {
      if (initial) {
        emit(initial.notification.id && `notifee:${initial.notification.id}`, initial.notification.data);
      }
    })
    .catch(() => undefined);
}

// Returns an unsubscribe function. Delivers a tap that arrived before subscribing.
export function subscribeNotificationTaps(fn: Listener): () => void {
  listener = fn;
  if (pending) {
    const queued = pending;
    pending = null;
    fn(queued);
  }
  return () => {
    if (listener === fn) { listener = null; }
  };
}
