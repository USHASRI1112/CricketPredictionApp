/* eslint-disable react-hooks/exhaustive-deps */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  Pressable,
} from 'react-native';
import { RootStackParamList } from '../../App';
import EndedCard from '../components/EndedCard';
import LiveCard from '../components/LiveCard';
import UpcomingCard from '../components/UpcomingCard';
import { LIST_LIVE_REFRESH_MS } from '../constants/Keys';
import { ALL_MATCHES_QUERY_KEY } from '../constants/QueryKeys';
import { isLiveMatch, isMatchInRecentDays } from '../helpers/MatchDate';
import { splitMatches } from '../helpers/SplitMatches';
import { fetchMatches } from '../services/Matches';
import { Match } from '../types';
import Add, { NativeAdCard } from './Add';


type AllMatchesScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AllMatches'
>;

type FilterKey = 'live' | 'upcoming' | 'ended';
const MAX_STARTUP_SPINNER_MS = 1500;

// ── Filter tab config ─────────────────────────────────────────
const FILTERS: {
  key: FilterKey;
  label: string;
  icon: string;
  accentColor: string;
  bgColor: string;
}[] = [
    { key: 'live', label: 'Live', icon: '🔴', accentColor: '#40d2e8', bgColor: '#3a1010' },
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
    <Pressable onPress={handlePress} style={styles.filterTabPressable}>
      {/* Outer View handles non-native styles; inner Animated.View only carries scale */}
      <View
        style={[
          styles.filterTab,
          { backgroundColor: tabBg, borderColor: tabBorderColor },
        ]}
      >
        <Animated.View
          style={[styles.filterTabInner, { transform: [{ scale }] }]}
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
    live: { icon: '📡', line1: 'No live matches', line2: 'Check back soon' },
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

function RefreshLoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={styles.refreshOverlay}>
      <ActivityIndicator size="small" color="#d4a843" />
    </View>
  );
}


// ─────────────────────────────────────────────────────────────
export default function AllMatchesScreen() {
  const navigation = useNavigation<AllMatchesScreenNavigationProp>();
  const route = useRoute<any>();
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const matchCardY = useRef<Record<string, number>>({});
  const hasAutoScrolled = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('live');
  const [startupSpinnerExpired, setStartupSpinnerExpired] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const focusFilter: FilterKey | undefined = route?.params?.focusFilter;
  const focusMatchId: string | undefined = route?.params?.focusMatchId;

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-16)).current;

  const {
    data: matches = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Match[]>({
    queryKey: ALL_MATCHES_QUERY_KEY,
    queryFn: fetchMatches,
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchInterval: LIST_LIVE_REFRESH_MS,
  });
  const wasRefetchingAllMatches = useRef(false);

  useEffect(() => {
    if (isRefetching) {
      console.log('[Polling][AllMatches] API refetch started', new Date().toISOString());
      wasRefetchingAllMatches.current = true;
      return;
    }

    if (wasRefetchingAllMatches.current) {
      const liveScoreSnapshot = matches
        .filter(isLiveMatch)
        .map(m => ({
          id: m.id,
          teams: m.teams,
          status: m.status,
          score: m.score,
        }));

      console.log(
        '[Polling][AllMatches] API refetch finished',
        new Date().toISOString(),
        '| matches:',
        matches.length,
        '| live scores:',
        liveScoreSnapshot,
      );
      wasRefetchingAllMatches.current = false;
    }
  }, [isRefetching, matches.length]);

  const { live, upcoming, ended, prioritizedLive, prioritizedUpcoming, prioritizedEnded } = useMemo(
    () => {
      // Separate prioritized (India/IPL) matches
      const prioritized = matches.filter(m => isIndiaOrIPLMatch(m));
      const nonPrioritized = matches.filter(m => !isIndiaOrIPLMatch(m));
      
      const prioritizedSplit = splitMatches(prioritized);
      const nonPrioritizedSplit = splitMatches(nonPrioritized);
      
      // Filter live matches to recent 5-day window
      const filterLiveRecent = (arr: Match[]) => arr.filter(match => isMatchInRecentDays(match, 4));
      
      return {
        ...nonPrioritizedSplit, // Regular matches (non-prioritized)
        prioritizedLive: filterLiveRecent(prioritizedSplit.live),
        prioritizedUpcoming: prioritizedSplit.upcoming,
        prioritizedEnded: prioritizedSplit.ended,
        live: filterLiveRecent(nonPrioritizedSplit.live),
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setStartupSpinnerExpired(true);
    }, MAX_STARTUP_SPINNER_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (focusFilter) {
      setActiveFilter(focusFilter);
    }
  }, [focusFilter]);

  useEffect(() => {
    if (!focusMatchId || hasAutoScrolled.current || activeFilter !== 'live') {
      return;
    }

    const targetY = matchCardY.current[focusMatchId];
    if (typeof targetY === 'number' && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(targetY - 16, 0), animated: true });
      hasAutoScrolled.current = true;
    }
  }, [activeFilter, focusMatchId, layoutVersion]);

  /*
   * Firebase storage bootstrap + live-score subscription disabled intentionally.
   * Keeping old implementation commented for later restore.
   *
   * const queryClient = useQueryClient();
   *
   * const storageQuery = useQuery<Match[] | null>({
   *   queryKey: ['ALL_MATCHES', 'storage'],
   *   queryFn: fetchMatchesFromLocal,
   *   refetchOnWindowFocus: false,
   * });
   *
   * const fetchMutation = useMutation<Match[], Error, void>({
   *   mutationFn: fetchMatches,
   *   onSuccess: (data: Match[]) => {
   *     setMatches(data);
   *     queryClient.setQueryData(['ALL_MATCHES', 'storage'], data);
   *   },
   *   onSettled: () => setRefreshing(false),
   * });
   *
   * useEffect(() => {
   *   const timer = setTimeout(() => {
   *     const unsub = subscribeToLiveScores((freshMatches) => {
   *       setMatches(prev => {
   *         if (!prev || prev.length === 0) {
   *           return freshMatches;
   *         }
Pina Allignemt baledhu bro screen size match kaledhu aa live, upcoming section   *
   *         const merged = new Map(prev.map(m => [m.id, m]));
   *         freshMatches.forEach(fresh => {
   *           const existing = merged.get(fresh.id);
   *           merged.set(fresh.id, {
   *             ...existing,
   *             ...fresh,
   *             status: fresh.status ?? existing?.status,
   *             score: fresh.score ?? existing?.score,
   *             matchEnded: fresh.matchEnded ?? existing?.matchEnded,
   *             matchStarted: fresh.matchStarted ?? existing?.matchStarted,
   *           });
   *         });
   *
   *         return Array.from(merged.values());
   *       });
   *     });
   *
   *     return () => {
   *       unsub();
   *     };
   *   }, 1000);
   *
   *   return () => clearTimeout(timer);
   * }, []);
   */

  // Counts per filter
  const counts: Record<FilterKey, number> = {
    live: live.length + prioritizedLive.length,
    upcoming: upcoming.length + prioritizedUpcoming.length,
    ended: ended.length + prioritizedEnded.length,
  };

  // Check if we have any matches to show ads
  const hasAnyMatches = matches.length > 0;
  const showSpinnerOverlay = !startupSpinnerExpired && isLoading && !matches.length;

  const handleMatchPress = (match: Match) => {
    // if (addRef.current?.showAd) {
    //   addRef.current.showAd(() => {
        navigation.navigate('Match', { matchId: match.id, match });
    //   });
    // } else {
    // }
  };

  // Visibility flags
  const showLive = activeFilter === 'live';
  const showUpcoming = activeFilter === 'upcoming';
  const showEnded = activeFilter === 'ended';

  const isFilterEmpty = counts[activeFilter] === 0;

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
          <Text style={styles.headerSub}>Live · Upcoming · Ended</Text>
        </Animated.View>

        {/* ── Filter pills ── */}
        <View style={styles.filterBar}>
          <View style={styles.filterBarContent}>
            {FILTERS.map(f => (
              <FilterTab
                key={f.key}
                filter={f}
                isActive={activeFilter === f.key}
                count={counts[f.key]}
                onPress={() => setActiveFilter(f.key)}
              />
            ))}
          </View>
        </View>

        {/* Thin separator under filter bar */}
        <View style={styles.filterSeparator} />

        <Add ref={addRef} />

        {/* ── Match list ── */}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor="#d4a843"
              colors={['#d4a843']}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await refetch();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          }
        >
          {isFilterEmpty && <EmptyState filter={activeFilter} />}

          {/* ── PRIORITIZED MATCHES (IPL/India) ── */}
          {showLive && prioritizedLive.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - LIVE NOW" delay={30} />
              {prioritizedLive.flatMap(match => {
                const card = (
                  <View
                    key={match.id}
                    onLayout={(event) => {
                      matchCardY.current[match.id] = event.nativeEvent.layout.y;
                      setLayoutVersion(version => version + 1);
                    }}
                  >
                    <LiveCard
                      match={match}
                      onPress={() => handleMatchPress(match)}
                      isRefetching={isRefetching}
                    />
                  </View>
                );
                return [card];
              })}
            </View>
          )}

          {showUpcoming && prioritizedUpcoming.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - UPCOMING" delay={90} />
              {prioritizedUpcoming.flatMap(match => {
                const card = <UpcomingCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                return [card];
              })}
            </View>
          )}

          {showEnded && prioritizedEnded.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⭐ IPL / INDIA - ENDED" delay={120} />
              {prioritizedEnded.flatMap(match => {
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
                const card = (
                  <View
                    key={match.id}
                    onLayout={(event) => {
                      matchCardY.current[match.id] = event.nativeEvent.layout.y;
                      setLayoutVersion(version => version + 1);
                    }}
                  >
                    <LiveCard
                      match={match}
                      onPress={() => handleMatchPress(match)}
                      isRefetching={isRefetching}
                    />
                  </View>
                );
                if (hasAnyMatches && (i + 1) % 3 === 0 && i !== live.length - 1) {
                  return [card, <NativeAdCard key={`ad-live-${i}`} />];
                }
                return [card];
              })}
              {hasAnyMatches && <NativeAdCard key="ad-live-end" />}
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
      <RefreshLoadingOverlay visible={showSpinnerOverlay} />
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
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  filterBarContent: {
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  filterTabPressable: {
    flex: 1,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    gap: 5,
  },
  filterTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  filterIcon: {
    fontSize: 12,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
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

  // ── Refresh Loading Overlay ───────────────────────
  refreshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
});
