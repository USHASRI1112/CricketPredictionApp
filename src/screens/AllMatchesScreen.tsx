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
  // AppState,
  // AppStateStatus,
} from 'react-native';
import { RootStackParamList } from '../../App';
import EndedCard from '../components/EndedCard';
import LiveCard from '../components/LiveCard';
import TodayCard from '../components/TodayCard';
import UpcomingCard from '../components/UpcomingCard';
// import { fetchLiveStatuses } from '../services/LiveStatus';
import { splitMatches } from '../helpers/SplitMatches';
import { shouldRefetchMatches } from '../helpers/ShouldRefetchMatches';
import { fetchMatches } from '../services/Matches';
import { fetchMatchesFromLocal } from '../services/MatchesFromLocal';
import { Match } from '../types';
import Add from './Add';

type AllMatchesScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'AllMatches'
>;

export default function AllMatchesScreen() {
  const navigation = useNavigation<AllMatchesScreenNavigationProp>();
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [_, setError] = useState<string | null>(null);

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
    onError: err => {
      setError && setError(err.message || 'Failed to fetch matches');
    },
    onSettled: () => setRefreshing(false),
  });

  useEffect(() => {
    if (
      storageQuery.isSuccess &&
      (!storageQuery.data || storageQuery.data.length === 0)
    ) {
      fetchMutation.mutate();
    } else if (storageQuery.data) {
      setMatches(storageQuery.data);
    }
  }, [storageQuery.data, storageQuery.isSuccess]);

  useEffect(() => {
    const checkAndRefetch = async () => {
      if (
        storageQuery.isSuccess &&
        storageQuery.data &&
        storageQuery.data.length > 0
      ) {
        const shouldRefetch = await shouldRefetchMatches();
        if (shouldRefetch) {
          fetchMutation.mutate();
        }
      }
    };

    checkAndRefetch();
  }, [storageQuery.isSuccess]);

  const { live, today, upcoming, ended } = useMemo(
    () => splitMatches(matches),
    [matches],
  );

  // const POLLING_INTERVAL_MS = 120000; // 2 minutes

  // const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // const liveStatusMutation = useMutation<Match[], Error, void, unknown>({
  //   mutationFn: () => fetchLiveStatuses(live),
  //   onError: (err: any) => console.error('Failed to fetch live statuses', err),
  //   onSuccess: (validUpdates: Match[] | undefined) => {
  //     if (!validUpdates || validUpdates.length === 0) return;

  //     const liveIds = new Set(live.map(l => l.id));
  //     setMatches(prev =>
  //       prev.map(m => {
  //         if (!liveIds.has(m.id)) return m;
  //         const u = validUpdates.find(x => x.id === m.id);
  //         if (!u) return m;
  //         // update only relevant live fields
  //         return {
  //           ...m,
  //           status: u.status ?? m.status,
  //           score: u.score ?? m.score,
  //           matchEnded: u.matchEnded ?? m.matchEnded,
  //           dateTimeGMT: u.dateTimeGMT ?? m.dateTimeGMT,
  //         } as Match;
  //       }),
  //     );
  //   },
  // });

  // const startPolling = () => {
  //   if (intervalRef.current) return;
  //   if (!live || live.length === 0) return;
  //   // intervalRef.current = setInterval(() => {
  //   //   if (!liveStatusMutation.isPending) {
  //   //     // liveStatusMutation.mutate();
  //   //   }
  //   // }, POLLING_INTERVAL_MS);
  //   // if (!liveStatusMutation.isPending) liveStatusMutation.mutate();
  // };

  // const stopPolling = () => {
  //   if (intervalRef.current) {
  //     clearInterval(intervalRef.current);
  //     intervalRef.current = null;
  //   }
  // };

  // useEffect(() => {
  //   if (!live || live.length === 0) {
  //     stopPolling();
  //     return;
  //   }

  //   if (appStateRef.current === 'active') startPolling();

  //   return () => stopPolling();
  // }, [live.length]);

  // useEffect(() => {
  //   const handleAppState = (next: AppStateStatus) => {
  //     appStateRef.current = next;
  //     if (next === 'active') {
  //       if (live && live.length > 0) startPolling();
  //     } else {
  //       stopPolling();
  //     }
  //   };

  //   const sub = AppState.addEventListener('change', handleAppState);
  //   return () => sub.remove();
  // }, [live.length]);

  const initialLoading =
    storageQuery.isLoading && !storageQuery.data && !fetchMutation.isPending;

  const handleMatchPress = (match: Match) => {
    const navigateToMatch = () => console.log('match n', match);
    navigation.navigate('Match', {
      matchId: match.id,
      match: match,
    });

    if (addRef.current?.showAd) {
      addRef.current.showAd(navigateToMatch);
    } else {
      navigateToMatch();
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>All Matches</Text>
          <ActivityIndicator size="large" color="#4299e1" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* <Text style={styles.title}>All Matches</Text> */}

        <Add ref={addRef} />
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || fetchMutation.isPending}
              onRefresh={() => {
                setRefreshing(true);
                fetchMutation.mutate();
              }}
            />
          }
        >
          {/* Live matches */}
          {live.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>🔴 Live Matches</Text>
              {live.map(match => (
                <LiveCard
                  key={match.id}
                  match={match}
                  onPress={() => handleMatchPress(match)}
                />
              ))}
            </View>
          )}

          {/* Today's upcoming (not live) */}
          {today.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>📅 Today's Matches</Text>
              {today.map(match => (
                <TodayCard
                  key={match.id}
                  match={match}
                  onPress={() => handleMatchPress(match)}
                />
              ))}
            </View>
          )}

          {/* Upcoming matches */}
          {upcoming.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>🔜 Upcoming Matches</Text>
              {upcoming.map(match => (
                <UpcomingCard
                  key={match.id}
                  match={match}
                  onPress={() => handleMatchPress(match)}
                />
              ))}
            </View>
          )}

          {/* Ended matches */}
          {ended.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>✅ Ended Matches</Text>
              {ended.map(match => (
                <EndedCard
                  key={match.id}
                  match={match}
                  onPress={() => handleMatchPress(match)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    backgroundColor: '#f7fafc',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  scrollView: {
    // flex: 1,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d3748',
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 4,
    letterSpacing: 0.3,
  },
});
