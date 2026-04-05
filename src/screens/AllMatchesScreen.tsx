/* eslint-disable react-hooks/exhaustive-deps */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  Pressable,
  Easing,
} from 'react-native';
import { RootStackParamList } from '../../App';
import EndedCard from '../components/EndedCard';
import LiveCard from '../components/LiveCard';
import TodayCard from '../components/TodayCard';
import UpcomingCard from '../components/UpcomingCard';
import { splitMatches } from '../helpers/SplitMatches';
import { shouldRefetchMatches } from '../helpers/ShouldRefetchMatches';
import { fetchMatches } from '../services/Matches';
import { fetchMatchesFromLocal } from '../services/MatchesFromLocal';
import { Match } from '../types';
import Add, { NativeAdCard } from './Add';
import { subscribeToLiveScores } from '../services/LiveScoreCache';


type AllMatchesScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AllMatches'
>;

type FilterKey = 'all' | 'live' | 'today' | 'upcoming' | 'ended';

// ── Filter tab config ─────────────────────────────────────────
const FILTERS: {
  key: FilterKey;
  label: string;
  icon: string;
  accentColor: string;
  bgColor: string;
}[] = [
    { key: 'all', label: 'All', icon: '🏏', accentColor: '#d4a843', bgColor: '#2e2e10' },
    { key: 'live', label: 'Live', icon: '🔴', accentColor: '#40d2e8', bgColor: '#3a1010' },
    { key: 'today', label: 'Today', icon: '📅', accentColor: '#d4a843', bgColor: '#2e2410' },
    { key: 'upcoming', label: 'Upcoming', icon: '⏳', accentColor: '#38c8a0', bgColor: '#0e2420' },
    { key: 'ended', label: 'Ended', icon: '✅', accentColor: '#8aaa6a', bgColor: '#1a2414' },
  ];

// ── India / IPL detection ─────────────────────────────────────────────────
function isIndiaOrIPLMatch(match: Match): boolean {
  const teamsStr  = (match.teams || []).join(' ').toLowerCase();
  const seriesStr = (match.series_id || match.series || match.name || '').toLowerCase();
  const venueStr  = (match.venue || '').toLowerCase();

  // 1. India playing
  const indiaPlaying =
    teamsStr.includes('india') ||
    teamsStr.includes(' ind ') ||
    teamsStr.startsWith('ind ') ||
    teamsStr.endsWith(' ind') ||
    teamsStr === 'ind';

  // 2. International match in India (venue is in India)
  const INDIA_VENUES = [
    'mumbai', 'delhi', 'chennai', 'kolkata', 'bangalore', 'bengaluru',
    'hyderabad', 'ahmedabad', 'pune', 'jaipur', 'lucknow', 'mohali',
    'chandigarh', 'nagpur', 'visakhapatnam', 'vizag', 'dharamsala',
    'ranchi', 'guwahati', 'cuttack', 'raipur', 'india','boland park'
  ];
  const matchInIndia = INDIA_VENUES.some(v => venueStr.includes(v));

  // 3. IPL
  const isIPL =
    seriesStr.includes('ipl') ||
    seriesStr.includes('indian premier league') ||
    seriesStr.includes('indian premier');

  return indiaPlaying || matchInIndia || isIPL;
}

// ── Animated section header ───────────────────────────────────
function SectionHeader({ label, delay = 0 }: { label: string; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.sectionHeaderRow, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.sectionAccentBar} />
      <Text style={styles.sectionHeader}>{label}</Text>
    </Animated.View>
  );
}

// ── Single filter pill ────────────────────────────────────────
function FilterTab({
  filter,
  isActive,
  count,
  onPress,
}: {
  filter: typeof FILTERS[number];
  isActive: boolean;
  count: number;
  onPress: () => void;
}) {
  // scale uses useNativeDriver: true — kept on its own Animated.Value
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    onPress();
  };

  // Non-animated active styles — just swap on re-render (instant, no conflict)
  const tabBg = isActive ? filter.bgColor : 'rgba(255,255,255,0.03)';
  const tabBorderColor = isActive ? filter.accentColor : 'rgba(255,255,255,0.07)';
  const labelColor = isActive ? filter.accentColor : '#4a6040';
  const badgeBg = isActive ? filter.accentColor : 'rgba(255,255,255,0.08)';
  const badgeTextColor = isActive ? '#0d1a08' : '#5a7050';

  return (
    <Pressable onPress={handlePress}>
      {/* Outer View handles non-native styles; inner Animated.View only carries scale */}
      <View
        style={[
          styles.filterTab,
          { backgroundColor: tabBg, borderColor: tabBorderColor },
        ]}
      >
        <Animated.View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, transform: [{ scale }] }}
        >
          <Text style={styles.filterIcon}>{filter.icon}</Text>
          <Text style={[styles.filterLabel, { color: labelColor }]}>
            {filter.label}
          </Text>
          {count > 0 && (
            <View style={[styles.countBadge, { backgroundColor: badgeBg }]}>
              <Text style={[styles.countBadgeText, { color: badgeTextColor }]}>
                {count}
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ filter }: { filter: FilterKey }) {
  const config: Record<FilterKey, { icon: string; line1: string; line2: string }> = {
    all: { icon: '🏏', line1: 'No matches yet', line2: 'Pull down to refresh' },
    live: { icon: '📡', line1: 'No live matches', line2: 'Check back soon' },
    today: { icon: '☀️', line1: 'Nothing today', line2: 'Enjoy the off day!' },
    upcoming: { icon: '🗓️', line1: 'No upcoming matches', line2: 'Stay tuned' },
    ended: { icon: '🏆', line1: 'No completed matches yet', line2: '' },
  };
  const { icon, line1, line2 } = config[filter];

  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyLine1}>{line1}</Text>
      {line2 ? <Text style={styles.emptyLine2}>{line2}</Text> : null}
    </View>
  );
}

// ── Dynamic Loading Messages ───────────────────────────────────
const LOADING_MESSAGES = [
  '⚡ Crunching the numbers... AI is thinking! 🧠',
  '🏏 Analyzing team form & player stats...',
  '📊 Calculating win probabilities in real-time...',
  '🎯 Our ML model is predicting the future! 🔮',
  '🔥 Getting the hottest predictions for you...',
  '💫 Fetching cosmic cricket wisdom...',
  '🎪 The prediction show is loading! 🎭',
  '⚾ Toss is in the air, predictions in the oven! 🍳',
  '🌟 Summoning the cricket gods... 🙏',
  '📱 Unlocking AI match intelligence...',
  '🏆 Building your path to victory...',
  '🚀 Launching prediction engines at full throttle!',
  '💥 Explosive analysis incoming in 3...2...1...',
  '🎯 Pinpointing the match winner with precision...',
  '⚡ Charging up the prediction batteries! 🔋',
  '🧪 Testing our crystal ball predictions...',
  '🎲 Rolling the dice of probability...',
  '📈 Graphing the path to your winning bets!',
  '🌈 Rainbow of predictions appearing on the horizon...',
  '🎬 Action! Analyzing your next big match...',
  '🔐 Unlocking hidden match insights...',
  '👑 Crowning our AI with match predictions...',
  '🎸 Playing the prediction symphony! 🎵',
  '🏅 Polishing the perfect prediction for you...',
  '⭐ Making magic happen with data science!',
];

// ── Loading Screen with Dynamic Messages ───────────────────────
function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);
  const spinnerRotation = useRef(new Animated.Value(0)).current;

  // Rotate spinner continuously
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinnerRotation, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // Change message every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const rotate = spinnerRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.loadingWrap}>
      <View style={styles.loadingCard}>
        <Animated.View style={[styles.spinnerContainer, { transform: [{ rotate }] }]}>
          <Text style={styles.spinnerEmoji}>🏏</Text>
        </Animated.View>
        <Text style={styles.loadingTitle}>LOADING</Text>
        <Text style={styles.dynamicMessage}>{LOADING_MESSAGES[messageIndex]}</Text>
        <View style={styles.dotsContainer}>
          <Text style={styles.dot}>●</Text>
          <Text style={styles.dot}>●</Text>
          <Text style={styles.dot}>●</Text>
        </View>
      </View>
    </View>
  );
}

// ── Refresh Loading Overlay ──────────────────────────────────────────────────────
function RefreshLoadingOverlay({ visible }: { visible: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.refreshOverlay}>
      <View style={styles.refreshOverlayContent}>
        <Text style={styles.refreshIcon}>⚡</Text>
        <Text style={styles.refreshTitle}>Refreshing Matches</Text>
        <Text style={styles.refreshMessage}>{LOADING_MESSAGES[messageIndex]}</Text>
      </View>
    </View>
  );
}


// ─────────────────────────────────────────────────────────────
export default function AllMatchesScreen() {
  const navigation = useNavigation<AllMatchesScreenNavigationProp>();
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [forceHideLoader, setForceHideLoader] = useState(false);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-16)).current;

  const queryClient = useQueryClient();

  const storageQuery = useQuery<Match[] | null>({
    queryKey: ['ALL_MATCHES', 'storage'],
    queryFn: fetchMatchesFromLocal,
    refetchOnWindowFocus: false,
  });

  const fetchMutation = useMutation<Match[], Error, void>({
    mutationFn: fetchMatches,
    onSuccess: (data: Match[]) => {
      setMatches(data);
      queryClient.setQueryData(['ALL_MATCHES', 'storage'], data);
    },
    onSettled: () => setRefreshing(false),
  });

  const { live, today, upcoming, ended, prioritizedLive, prioritizedToday, prioritizedUpcoming, prioritizedEnded } = useMemo(
    () => {
      // Separate prioritized (India/IPL) matches
      const prioritized = matches.filter(m => isIndiaOrIPLMatch(m));
      const nonPrioritized = matches.filter(m => !isIndiaOrIPLMatch(m));
      
      const prioritizedSplit = splitMatches(prioritized);
      const nonPrioritizedSplit = splitMatches(nonPrioritized);
      
      return {
        ...nonPrioritizedSplit, // Regular matches (non-prioritized)
        prioritizedLive: prioritizedSplit.live,
        prioritizedToday: prioritizedSplit.today,
        prioritizedUpcoming: prioritizedSplit.upcoming,
        prioritizedEnded: prioritizedSplit.ended,
      };
    },
    [matches],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(headerY, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  // Stop initial loading as soon as we have any matches
  useEffect(() => {
    if (matches.length > 0) {
      setIsInitialLoading(false);
    }
  }, [matches.length]);

  useEffect(() => {
    // Delay the initial data check to prevent blocking navigation
    const timer = setTimeout(() => {
      if (storageQuery.isSuccess && (!storageQuery.data || storageQuery.data.length === 0)) {
        fetchMutation.mutate();
      } else if (storageQuery.data) {
        setMatches(storageQuery.data);
      }
    }, 500); // Small delay to allow screen to render first

    return () => clearTimeout(timer);
  }, [storageQuery.data, storageQuery.isSuccess]);

  useEffect(() => {
    // Delay the refetch check to prevent blocking initial load
    const timer = setTimeout(() => {
      const checkAndRefetch = async () => {
        if (storageQuery.isSuccess && storageQuery.data && storageQuery.data.length > 0) {
          const shouldRefetch = await shouldRefetchMatches();
          if (shouldRefetch) fetchMutation.mutate();
        }
      };
      checkAndRefetch();
    }, 1000); // Delay by 1 second

    return () => clearTimeout(timer);
  }, [storageQuery.isSuccess]);

  // Periodic refetch in premium mode
  useEffect(() => {
    // console.log('[AllMatchesScreen] Setting up periodic refetch');
    const interval = setInterval(async () => {
      // console.log('[AllMatchesScreen] Periodic check');
      if (storageQuery.isSuccess && storageQuery.data && storageQuery.data.length > 0 && !refreshing) {
        const shouldRefetch = await shouldRefetchMatches();
        // console.log('[AllMatchesScreen] Should refetch:', shouldRefetch);
        if (shouldRefetch) {
          // console.log('[AllMatchesScreen] Triggering refetch');
          fetchMutation.mutate();
        }
      }
    }, 120000); // Check every 2 minutes

    return () => clearInterval(interval);
  }, [storageQuery.isSuccess, storageQuery.data, refreshing]);

  useEffect(() => {
    // Delay subscription slightly to avoid blocking initial render.
    const timer = setTimeout(() => {
      // console.log('[LiveCache] Subscribing to Firestore live scores');

      const unsub = subscribeToLiveScores((freshMatches) => {
        // console.log(`[LiveCache] Got ${freshMatches.length} fresh live matches from Firestore`);

        setMatches(prev => {
          if (!prev || prev.length === 0) {
            return freshMatches;
          }

          const merged = new Map(prev.map(m => [m.id, m]));
          freshMatches.forEach(fresh => {
            const existing = merged.get(fresh.id);
            merged.set(fresh.id, {
              ...existing,
              ...fresh,
              status: fresh.status ?? existing?.status,
              score: fresh.score ?? existing?.score,
              matchEnded: fresh.matchEnded ?? existing?.matchEnded,
              matchStarted: fresh.matchStarted ?? existing?.matchStarted,
            });
          });

          return Array.from(merged.values());
        });
      });

      return () => {
        // console.log('[LiveCache] Unsubscribing from live scores');
        unsub();
      };
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Force hide loader after 700ms to prevent hanging
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceHideLoader(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);




  // Counts per filter
  const counts: Record<FilterKey, number> = {
    all: matches.length,
    live: live.length,
    today: today.length,
    upcoming: upcoming.length,
    ended: ended.length,
  };

  // Check if we have any matches to show ads
  const hasAnyMatches = matches.length > 0;

  // Show loading only for initial load, not auto-refresh
  const showLoadingScreen = !forceHideLoader && (isInitialLoading || (storageQuery.isLoading && !matches.length));

  const handleMatchPress = (match: Match) => {
    if (addRef.current?.showAd) {
      addRef.current.showAd(() => {
        navigation.navigate('Match', { matchId: match.id, match });
      });
    } else {
      navigation.navigate('Match', { matchId: match.id, match });
    }
  };

  // Visibility flags
  const showLive = activeFilter === 'all' || activeFilter === 'live';
  const showToday = activeFilter === 'all' || activeFilter === 'today';
  const showUpcoming = activeFilter === 'all' || activeFilter === 'upcoming';
  const showEnded = activeFilter === 'all' || activeFilter === 'ended';

  const isFilterEmpty = counts[activeFilter] === 0;

  // ── Loading screen ────────────────────────────────
  if (showLoadingScreen) {
    return (
      <View style={styles.container}>
        <LoadingScreen />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>

        {/* ── Header ── */}
        <Animated.View
          style={[
            styles.header,
            { opacity: headerOpacity, transform: [{ translateY: headerY }] },
          ]}
        >
          <View style={styles.headerAccent} />
          <Text style={styles.headerTitle}>MATCHES</Text>
          <View style={styles.headerDivider} />
          <Text style={styles.headerSub}>Live · Today · Upcoming · Ended</Text>
        </Animated.View>

        {/* ── Filter pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}
          style={styles.filterBar}
        >
          {FILTERS.map(f => (
            <FilterTab
              key={f.key}
              filter={f}
              isActive={activeFilter === f.key}
              count={counts[f.key]}
              onPress={() => setActiveFilter(f.key)}
            />
          ))}
        </ScrollView>

        {/* Thin separator under filter bar */}
        <View style={styles.filterSeparator} />

        <Add ref={addRef} />

        {/* ── Match list ── */}
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || fetchMutation.isPending}
              tintColor="#d4a843"
              colors={['#d4a843']}
              onRefresh={() => {
                setRefreshing(true);
                fetchMutation.mutate();
              }}
            />
          }
        >
          {isFilterEmpty && <EmptyState filter={activeFilter} />}

          {/* ── PRIORITIZED MATCHES (IPL/India) ── */}
          {showLive && prioritizedLive.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - LIVE NOW" delay={30} />
              {prioritizedLive.flatMap((match, i) => {
                const card = <LiveCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                return [card];
              })}
            </View>
          )}

          {showToday && prioritizedToday.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - TODAY" delay={60} />
              {prioritizedToday.flatMap((match, i) => {
                const card = <TodayCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                return [card];
              })}
            </View>
          )}

          {showUpcoming && prioritizedUpcoming.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - UPCOMING" delay={90} />
              {prioritizedUpcoming.flatMap((match, i) => {
                const card = <UpcomingCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                return [card];
              })}
            </View>
          )}

          {showEnded && prioritizedEnded.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - ENDED" delay={120} />
              {prioritizedEnded.flatMap((match, i) => {
                const card = <EndedCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                return [card];
              })}
            </View>
          )}

          {/* ── ALL OTHER MATCHES ── */}
          {showLive && live.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="🔴  LIVE NOW" delay={150} />
              {live.flatMap((match, i) => {
                const card = <LiveCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if (hasAnyMatches && (i + 1) % 3 === 0 && i !== live.length - 1) {
                  return [card, <NativeAdCard key={`ad-live-${i}`} />];
                }
                return [card];
              })}
              {hasAnyMatches && <NativeAdCard key="ad-live-end" />}
            </View>
          )}

          {showToday && today.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="📅  TODAY" delay={180} />
              {today.flatMap((match, i) => {
                const card = <TodayCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if (hasAnyMatches && (i + 1) % 3 === 0 && i !== today.length - 1) {
                  return [card, <NativeAdCard key={`ad-today-${i}`} />];
                }
                return [card];
              })}
              {hasAnyMatches && <NativeAdCard key="ad-today-end" />}
            </View>
          )}

          {showUpcoming && upcoming.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⏳  UPCOMING" delay={210} />
              {upcoming.flatMap((match, i) => {
                const card = <UpcomingCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if (hasAnyMatches && (i + 1) % 3 === 0 && i !== upcoming.length - 1) {
                  return [card, <NativeAdCard key={`ad-upcoming-${i}`} />];
                }
                return [card];
              })}
              {hasAnyMatches && <NativeAdCard key="ad-upcoming-end" />}
            </View>
          )}

          {showEnded && ended.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="✅  ENDED" delay={240} />
              {ended.flatMap((match, i) => {
                const card = <EndedCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if (hasAnyMatches && (i + 1) % 3 === 0 && i !== ended.length - 1) {
                  return [card, <NativeAdCard key={`ad-ended-${i}`} />];
                }
                return [card];
              })}
              {hasAnyMatches && <NativeAdCard key="ad-ended-end" />}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
      <RefreshLoadingOverlay visible={fetchMutation.isPending && matches.length > 0} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1a08',
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },

  // ── Header ────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  headerAccent: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#d4a843',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#f0e6c8',
    letterSpacing: 8,
    textShadowColor: 'rgba(212,168,67,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerDivider: {
    width: 120,
    height: 1,
    backgroundColor: 'rgba(212,168,67,0.3)',
    marginVertical: 8,
  },
  headerSub: {
    fontSize: 10,
    color: '#8aaa6a',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  // ── Filter bar ────────────────────────────────────
  filterBar: {
    flexGrow: 0,
    marginBottom: 4,
  },
  filterBarContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    gap: 5,
  },
  filterIcon: {
    fontSize: 13,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  filterSeparator: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: 'rgba(212,168,67,0.1)',
    marginBottom: 4,
  },

  // ── Scroll + sections ─────────────────────────────
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
  sectionAccentBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#d4a843',
    marginRight: 10,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#d4a843',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  // ── Empty state ───────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 40,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 4,
  },
  emptyLine1: {
    color: '#4a6040',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyLine2: {
    color: '#2e3e28',
    fontSize: 12,
    letterSpacing: 1,
  },

  // ── Loading ───────────────────────────────────────
  loadingWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 26, 8, 0.3)',
    zIndex: 100,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(45, 55, 30, 0.85)',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: 280,
  },

  loadingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f0e6c8',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 8,
  },

  loadingSubtitle: {
    marginTop: 8,
    fontSize: 12,
    color: '#8aaa6a',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },

  // ── Dynamic Loading Screen ────────────────────────
  spinnerContainer: {
    width: 80,
    height: 80,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45, 55, 30, 0.85)',
    borderRadius: 16,
    padding: 16,
  },
  spinnerEmoji: {
    fontSize: 60,
  },
  dynamicMessage: {
    fontSize: 16,
    color: '#40d2e8',
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 20,
    maxWidth: 320,
    lineHeight: 24,
    letterSpacing: 0.5,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  dot: {
    fontSize: 12,
    color: '#d4a843',
  },

  // ── Refresh Loading Overlay ───────────────────────
  refreshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 26, 8, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  refreshOverlayContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(45, 55, 30, 0.85)',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  refreshTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#40d2e8',
    marginBottom: 12,
    letterSpacing: 2,
  },
  refreshMessage: {
    fontSize: 14,
    color: '#d4a843',
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});