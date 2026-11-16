/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// ─── FCM Background Handler ────────────────────────────────────────────────
// This MUST live here at the top level, outside any component.
// Android needs this to handle notifications when the app is killed/background.
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { registerNotificationTapSources } from './src/services/NotificationTaps';


setBackgroundMessageHandler(getMessaging(), async () => {});

// Notification taps (FCM and notifee), registered before the App mounts so a
// tap that launched the app is never missed.
registerNotificationTapSources();
// ──────────────────────────────────────────────────────────────────────────

AppRegistry.registerComponent(appName, () => App);
