import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { shouldRefetchMatches } from './src/helpers/ShouldRefetchMatches';
import AllMatchesScreen from './src/screens/AllMatchesScreen';
import HomeScreen from './src/screens/HomeScreen';
import MatchScreen from './src/screens/MatchScreen';
import { fetchMatches } from './src/services/Matches';
import { Match } from './src/types';
import {
  initPushNotifications,
  subscribeToTopicHandler,
  onForegroundNotification,
  onNotificationTap,
  TOPICS,
  createNotificationChannel,
} from './src/services/PushNotifications';
import { recordUserActivity } from './src/services/UserActivity';

export type RootStackParamList = {
  Home: undefined;
  AllMatches: undefined;
  Match: { matchId: string; match: Match };
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
    if (data.type === 'prediction') return 'prediction';
  }
  const t = title.toLowerCase();
  if (t.includes('india') || t.includes('ind')) return 'india';
  if (t.includes('ipl'))                         return 'ipl';
  if (t.includes('live') || t.includes('start')) return 'live';
  if (t.includes('predict') || t.includes('ai')) return 'prediction';
  return 'default';
}

export default function App() {
  const isDarkMode    = useColorScheme() === 'dark';
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  // ── Record user activity on open + foreground ─────────────────────────
  useEffect(() => {
    recordUserActivity();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        recordUserActivity();
      }
    });

    return () => sub.remove();
  }, []);

  // ── Startup refetch ───────────────────────────────────────────────────
  useEffect(() => {
    const checkRefetch = async () => {
      try {
        const should = await shouldRefetchMatches();
        if (should) {
          const data = await fetchMatches();
          queryClient.setQueryData(['ALL_MATCHES', 'storage'], data);
        }
      } catch (e) {
        console.warn('Error during startup refetch check', e);
      }
    };
    checkRefetch();
  }, []);

  // ── Push notifications ────────────────────────────────────────────────
  useEffect(() => {
    createNotificationChannel();
    initPushNotifications();
    subscribeToTopicHandler(TOPICS.INDIA_MATCHES);
    subscribeToTopicHandler(TOPICS.IPL_MATCHES);
    subscribeToTopicHandler(TOPICS.LIVE_MATCHES);
    subscribeToTopicHandler(TOPICS.PREDICTIONS);

    const unsubscribeForeground = onForegroundNotification((title, body, data) => {
      console.log('[FCM] Foreground → showing toast:', title, body);
      setToast({ title, body, type: resolveToastType(title, data) });
    });

    onNotificationTap((data) => {
      if (!data) { return; }
      if (data.screen === 'Match' && data.matchId) {
        const cached = queryClient.getQueryData<Match[]>(['ALL_MATCHES', 'storage']);
        const match  = cached?.find(m => m.id === data.matchId);
        if (match) {
          navigationRef.current?.navigate('Match', { matchId: data.matchId, match });
        } else {
          navigationRef.current?.navigate('AllMatches');
        }
      } else if (data.screen === 'AllMatches') {
        navigationRef.current?.navigate('AllMatches');
      } else {
        navigationRef.current?.navigate('Home');
      }
    });

    return () => { unsubscribeForeground(); };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#03080F" />

      <QueryClientProvider client={queryClient}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle:      { backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' },
              headerTintColor:  isDarkMode ? '#ffffff' : '#000000',
              headerTitleStyle: { fontWeight: 'bold' },
            }}
          >
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