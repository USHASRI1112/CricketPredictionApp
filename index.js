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


setBackgroundMessageHandler(getMessaging(), async remoteMessage => {
  console.log('Background message:', remoteMessage);
});
// ──────────────────────────────────────────────────────────────────────────

AppRegistry.registerComponent(appName, () => App);