import { NavigationContainer, NavigationContainerRef, StackActions, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  useColorScheme,
  View,
  Text,
  Animated,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from 'react-native';
import { initializeAds } from './src/ads/AdsInit';
import { suppressInterstitials } from './src/ads/AdConfig';
import { ALL_MATCHES_QUERY_KEY } from './src/constants/QueryKeys';
import { getMatchesFromStorage } from './src/helpers/GetMatchesFromStorage';
import { shouldRefetchMatches } from './src/helpers/ShouldRefetchMatches';
import AllMatchesScreen from './src/screens/AllMatchesScreen';
import HomeScreen from './src/screens/HomeScreen';
import MatchScreen from './src/screens/MatchScreen';
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen';
import MatchCenterScreen, { MatchCenterTab } from './src/screens/MatchCenterScreen';
import { fetchMatches } from './src/services/Matches';
import SplashScreen from './src/screens/SplashScreen';
import { Match } from './src/types';
import {
  ensureAndroidNotificationPermission,
  initPushNotifications,
  onForegroundNotification,
  createNotificationChannel,
  showForegroundNotification,
} from './src/services/PushNotifications';
import { subscribeNotificationTaps, TapData } from './src/services/NotificationTaps';
import { resolveNotificationTarget } from './src/helpers/NotificationTarget';
import { applyNotificationPrefs, loadNotificationPrefs } from './src/services/NotificationPrefs';

// No interstitials right after a notification tap.
const NOTIFICATION_AD_GRACE_MS = 3 * 60 * 1000;

export type RootStackParamList = {
  Home: undefined;
  AllMatches: {
    focusFilter?: 'live' | 'upcoming' | 'ended';
    focusMatchId?: string;
  } | undefined;
  Match: { matchId: string; match: Match };
  Splash: undefined;
  NotificationSettings: undefined;
  MatchCenter: { match: Match; tab?: MatchCenterTab };
};

const Stack       = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

interface ToastData {
  title: string;
  body:  string;
  type:  'india' | 'ipl' | 'live' | 'prediction' | 'default';
}

function NotificationToast({ data, onDismiss }: { data: ToastData; onDismiss: () => void }) {
  const slideY  = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: 0, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => dismiss(), 5000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideY,  { toValue: -120, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const accent =
    data.type === 'india'      ? '#00E5FF' :
    data.type === 'ipl'        ? '#FF8C00' :
    data.type === 'live'       ? '#00E096' :
    data.type === 'prediction' ? '#F5C542' : '#a78bfa';

  const icon =
    data.type === 'india'      ? '🇮🇳' :
    data.type === 'ipl'        ? '🏏' :
    data.type === 'live'       ? '🟢' :
    data.type === 'prediction' ? '🔮' : '🔔';

  return (
    <Animated.View style={[toastStyles.container, { borderLeftColor: accent, transform: [{ translateY: slideY }], opacity }]}>
      <View style={[toastStyles.accentBar, { backgroundColor: accent }]} />
      <Text style={toastStyles.icon}>{icon}</Text>
      <View style={toastStyles.textWrap}>
        <Text style={toastStyles.title} numberOfLines={1}>{data.title}</Text>
        <Text style={toastStyles.body}  numberOfLines={2}>{data.body}</Text>
      </View>
      <TouchableOpacity onPress={dismiss} style={toastStyles.closeBtn}>
        <Text style={toastStyles.closeText}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute', top: 8, left: 16, right: 16,
    zIndex: 99999, elevation: 99999,
    backgroundColor: 'rgba(10, 22, 40, 0.96)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderLeftWidth: 3,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 14 },
  icon:      { fontSize: 22, marginLeft: 4 },
  textWrap:  { flex: 1 },
  title:     { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  body:      { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 17 },
  closeBtn:  { padding: 4 },
  closeText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});

function resolveToastType(title: string, data: Record<string, string>): ToastData['type'] {
  if (data?.type) {
    if (data.type === 'india')      return 'india';
    if (data.type === 'ipl')        return 'ipl';
    if (data.type === 'live')       return 'live';
    if (data.type === 'prediction' || data.type === 'prediction_ready') return 'prediction';
  }
  const t = title.toLowerCase();
  // Whole words only, so "behind" isn't India and "again" isn't AI.
  if (/\b(india|ind)\b/.test(t))                 return 'india';
  if (/\bipl\b/.test(t))                         return 'ipl';
  if (t.includes('live') || t.includes('start')) return 'live';
  if (t.includes('predict') || /\bai\b/.test(t)) return 'prediction';
  return 'default';
}



export function SplashWrapper() {
  type RootNav = NativeStackNavigationProp<any>;
  const navigation = useNavigation<RootNav>();
 
  return (
    <SplashScreen
      onFinish={() =>
        navigation.replace('Home') // replaces splash so back-button won't return to it
      }
    />
  );
}
 
// ── Notification tap → screen ───────────────────────────────────────────
const FRESH_MATCH_WAIT_MS = 4000;

// Prefer the backend's latest copy (a result alert's match has just ended, so the
// phone's copy may still say live), but don't keep the user waiting: after a few
// seconds, or offline, fall back to what's in memory or storage.
async function findMatch(matchId: string): Promise<Match | undefined> {
  const fresh = await Promise.race([
    fetchMatches().catch(() => undefined),
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), FRESH_MATCH_WAIT_MS)),
  ]);
  if (fresh && fresh.length > 0) {
    queryClient.setQueryData(ALL_MATCHES_QUERY_KEY, fresh);
    const found = fresh.find(m => m.id === matchId);
    if (found) { return found; }
  }
  const inMemory = queryClient.getQueryData<Match[]>(ALL_MATCHES_QUERY_KEY);
  return inMemory?.find(m => m.id === matchId)
    ?? (await getMatchesFromStorage()).find(m => m.id === matchId);
}

type NavRef = React.RefObject<NavigationContainerRef<RootStackParamList> | null>;

async function waitForNavigation(navigationRef: NavRef): Promise<boolean> {
  for (let i = 0; i < 100 && !navigationRef.current?.isReady(); i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  return !!navigationRef.current?.isReady();
}

let latestTap = 0;

async function openFromNotification(navigationRef: NavRef, data: TapData) {
  const tap = ++latestTap;
  const match = data.screen === 'Match' && data.matchId ? await findMatch(data.matchId) : undefined;
  const target = resolveNotificationTarget(data, match);
  if (!(await waitForNavigation(navigationRef)) || tap !== latestTap) { return; } // a newer tap wins
  const nav = navigationRef.current!;
  const current = nav.getCurrentRoute();

  // Cold start: replace the splash with Home + target, so Back goes to Home
  // and the splash can't later swap the target out for Home.
  if (!current || current.name === 'Splash') {
    const routes: { name: keyof RootStackParamList; params?: object }[] = [{ name: 'Home' }];
    if (target.screen === 'Match') {
      routes.push({ name: 'Match', params: { matchId: target.match.id, match: target.match } });
    } else if (target.screen === 'AllMatches') {
      routes.push({ name: 'AllMatches', params: { focusFilter: target.focusFilter, focusMatchId: target.focusMatchId } });
    }
    nav.reset({ index: routes.length - 1, routes: routes as any });
    return;
  }

  if (target.screen === 'Match') {
    const params = { matchId: target.match.id, match: target.match };
    const onSameMatch = current.name === 'Match'
      && (current.params as RootStackParamList['Match'] | undefined)?.matchId === target.match.id;
    if (onSameMatch) {
      nav.setParams(params); // refresh it (e.g. now ended) instead of stacking a copy
    } else {
      nav.dispatch(StackActions.push('Match', params));
    }
  } else if (target.screen === 'AllMatches') {
    nav.navigate('AllMatches', { focusFilter: target.focusFilter, focusMatchId: target.focusMatchId });
  } else {
    nav.navigate('Home');
  }
}

export default function App() {
  const isDarkMode    = useColorScheme() === 'dark';
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  // ── Initialize AdMob (after the consent form, where required) ─────────
  useEffect(() => {
    void initializeAds();
  }, []);

  // ── Startup fetch + periodic/foreground refetch ──────────────────────
  // Requests to /matches also tell the backend users are active, so it
  // refreshes scores faster while people are in the app.
  useEffect(() => {
    const startupFetch = async () => {
      try {
        const cachedMatches = await getMatchesFromStorage();
        if (cachedMatches.length > 0) {
          queryClient.setQueryData(ALL_MATCHES_QUERY_KEY, cachedMatches);
        }

        const data = await fetchMatches();
        queryClient.setQueryData(ALL_MATCHES_QUERY_KEY, data);
      } catch (e) {
        console.warn('Error during startup fetch', e);
      }
    };

    const checkRefetch = async () => {
      try {
        const should = await shouldRefetchMatches();
        if (should) {
          const data = await fetchMatches();
          queryClient.setQueryData(ALL_MATCHES_QUERY_KEY, data);
        }
      } catch (e) {
        console.warn('Error during refetch check', e);
      }
    };
    
    startupFetch();
    
    // Check every minute (fetches when the copy is >2 min old) so ended
    // matches show up within a couple of minutes; also on return to foreground.
    const interval = setInterval(checkRefetch, 60 * 1000);
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void checkRefetch();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);

  // ── Notification taps ─────────────────────────────────────────────────
  // Independent of permission/token setup below, so a tap always navigates —
  // even offline or if notification setup fails.
  useEffect(() => subscribeNotificationTaps(data => {
    suppressInterstitials(NOTIFICATION_AD_GRACE_MS);
    void openFromNotification(navigationRef, data);
  }), []);

  // ── Push notifications ────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribeForeground = onForegroundNotification((title, body, data) => {
      void showForegroundNotification(title, body, data);
      setToast({ title, body, type: resolveToastType(title, data) });
    });

    async function setupNotifications() {
      try {
        await createNotificationChannel();
        await ensureAndroidNotificationPermission();
        const token = await initPushNotifications();
        if (!token) {
          console.warn('[FCM] Permission denied or token unavailable; skipping topic subscriptions');
          return;
        }

        // Topics the user turned on in Notification settings
        await applyNotificationPrefs(await loadNotificationPrefs());
      } catch (e) {
        console.error('[FCM] Setup failed:', e);
      }
    }

    setupNotifications();

    return unsubscribeForeground;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#03080F' }}>
      <StatusBar barStyle="light-content" backgroundColor="#03080F" />

      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName="Splash"
            screenOptions={{
              headerStyle:      { backgroundColor: '#03080F' },
              headerTintColor:  '#ffffff',
              headerTitleStyle: { fontWeight: 'bold', color: '#ffffff' },
              contentStyle:     { backgroundColor: '#03080F' },
            }}
          >
            <Stack.Screen name="Splash" component={SplashWrapper} options={{ headerShown: false }} />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ headerShown: false, headerTintColor: '#ffffff' }}
            />
            <Stack.Screen
              name="AllMatches"
              component={AllMatchesScreen}
              options={{ title: 'All Matches' }}
            />
            <Stack.Screen
              name="Match"
              component={MatchScreen}
              options={{ title: 'Match Prediction' }}
            />
            <Stack.Screen
              name="NotificationSettings"
              component={NotificationSettingsScreen}
              options={{ title: 'Notifications' }}
            />
            <Stack.Screen
              name="MatchCenter"
              component={MatchCenterScreen}
              options={{ title: 'Match Center' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>

      {toast && (
        <NotificationToast
          data={toast}
          onDismiss={() => setToast(null)}
        />
      )}
    </View>
  );
}
