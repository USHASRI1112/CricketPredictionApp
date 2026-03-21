/* eslint-disable react-hooks/exhaustive-deps */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import TodayCard from '../components/TodayCard';
import UpcomingCard from '../components/UpcomingCard';
import { splitMatches } from '../helpers/SplitMatches';
import { shouldRefetchMatches } from '../helpers/ShouldRefetchMatches';
import { fetchMatches } from '../services/Matches';
import { fetchMatchesFromLocal } from '../services/MatchesFromLocal';
import { Match } from '../types';
import Add, { NativeAdCard } from './Add';

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
    { key: 'live', label: 'Live', icon: '🔴', accentColor: '#e84040', bgColor: '#3a1010' },
    { key: 'today', label: 'Today', icon: '📅', accentColor: '#d4a843', bgColor: '#2e2410' },
    { key: 'upcoming', label: 'Upcoming', icon: '⏳', accentColor: '#38c8a0', bgColor: '#0e2420' },
    { key: 'ended', label: 'Ended', icon: '✅', accentColor: '#8aaa6a', bgColor: '#1a2414' },
  ];

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


// ─────────────────────────────────────────────────────────────
export default function AllMatchesScreen() {
  const navigation = useNavigation<AllMatchesScreenNavigationProp>();
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [_, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(headerY, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

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
    onError: err => setError(err.message || 'Failed to fetch matches'),
    onSettled: () => setRefreshing(false),
  });

  useEffect(() => {
    if (storageQuery.isSuccess && (!storageQuery.data || storageQuery.data.length === 0)) {
      fetchMutation.mutate();
    } else if (storageQuery.data) {
      setMatches(storageQuery.data);
    }
  }, [storageQuery.data, storageQuery.isSuccess]);

  useEffect(() => {
    const checkAndRefetch = async () => {
      if (storageQuery.isSuccess && storageQuery.data && storageQuery.data.length > 0) {
        const shouldRefetch = await shouldRefetchMatches();
        if (shouldRefetch) fetchMutation.mutate();
      }
    };
    checkAndRefetch();
  }, [storageQuery.isSuccess]);

  const { live, today, upcoming, ended } = useMemo(
    () => splitMatches(matches),
    [matches],
  );

  // Counts per filter
  const counts: Record<FilterKey, number> = {
    all: matches.length,
    live: live.length,
    today: today.length,
    upcoming: upcoming.length,
    ended: ended.length,
  };

  const initialLoading =
    storageQuery.isLoading && !storageQuery.data && !fetchMutation.isPending;

  const handleMatchPress = (match: Match) => {
    const navigateToMatch = () => console.log('match n', match);
    navigation.navigate('Match', { matchId: match.id, match });
    if (addRef.current?.showAd) {
      addRef.current.showAd(navigateToMatch);
    } else {
      navigateToMatch();
    }
  };

  // Visibility flags
  const showLive = activeFilter === 'all' || activeFilter === 'live';
  const showToday = activeFilter === 'all' || activeFilter === 'today';
  const showUpcoming = activeFilter === 'all' || activeFilter === 'upcoming';
  const showEnded = activeFilter === 'all' || activeFilter === 'ended';

  const isFilterEmpty = counts[activeFilter] === 0;

  // ── Loading screen ────────────────────────────────
  if (initialLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingTitle}>CRICKET</Text>
          <Text style={styles.loadingSubtitle}>Loading Matches…</Text>
          <ActivityIndicator size="large" color="#d4a843" style={{ marginTop: 20 }} />
        </View>
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

          {showLive && live.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="🔴  LIVE NOW" delay={60} />
              {live.flatMap((match, i) => {
                const card = <LiveCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if ((i + 1) % 3 === 0 && i !== live.length - 1) {
                  return [card, <NativeAdCard key={`ad-live-${i}`} />];
                }
                return [card];
              })}
              <NativeAdCard key="ad-live-end" />
            </View>
          )}

          {showToday && today.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="📅  TODAY" delay={120} />
              {today.flatMap((match, i) => {
                const card = <TodayCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if ((i + 1) % 3 === 0 && i !== today.length - 1) {
                  return [card, <NativeAdCard key={`ad-today-${i}`} />];
                }
                return [card];
              })}
              <NativeAdCard key="ad-today-end" />
            </View>
          )}

          {showUpcoming && upcoming.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="⏳  UPCOMING" delay={180} />
              {upcoming.flatMap((match, i) => {
                const card = <UpcomingCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if ((i + 1) % 3 === 0 && i !== upcoming.length - 1) {
                  return [card, <NativeAdCard key={`ad-upcoming-${i}`} />];
                }
                return [card];
              })}
              <NativeAdCard key="ad-upcoming-end" />
            </View>
          )}

          {showEnded && ended.length > 0 && (
            <View style={styles.section}>
              <SectionHeader label="✅  ENDED" delay={240} />
              {ended.flatMap((match, i) => {
                const card = <EndedCard key={match.id} match={match} onPress={() => handleMatchPress(match)} />;
                if ((i + 1) % 3 === 0 && i !== ended.length - 1) {
                  return [card, <NativeAdCard key={`ad-ended-${i}`} />];
                }
                return [card];
              })}
               <NativeAdCard key="ad-ended-end" />
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#f0e6c8',
    letterSpacing: 10,
    textShadowColor: 'rgba(212,168,67,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  loadingSubtitle: {
    marginTop: 8,
    fontSize: 12,
    color: '#8aaa6a',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});