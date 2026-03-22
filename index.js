/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// ─── FCM Background Handler ────────────────────────────────────────────────
// This MUST live here at the top level, outside any component.
// Android needs this to handle notifications when the app is killed/background.
import messaging from '@react-native-firebase/messaging';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Android displays the notification automatically from the payload.
  // You don't need to do anything here — but you can log for debugging.
  console.log('[FCM] Background message received:', remoteMessage);
});
// ──────────────────────────────────────────────────────────────────────────

AppRegistry.registerComponent(appName, () => App);